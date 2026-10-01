package api

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/yookassa"
)

const (
	minDonationRubles = 50
	maxDonationRubles = 100_000
)

type createDonationRequest struct {
	AmountRubles   int64  `json:"amountRubles"`
	Name           string `json:"name"`
	ShowPublic     bool   `json:"showPublic"`
	Message        string `json:"message"`
	ShowAmount     bool   `json:"showAmount"`
	ShowMessage    bool   `json:"showMessage"`
	Monthly        bool   `json:"monthly"`
	MonthlyConsent bool   `json:"monthlyConsent"`
	RecoveryEmail  string `json:"recoveryEmail"`
}

type createDonationResponse struct {
	ID              string `json:"id"`
	ConfirmationURL string `json:"confirmationUrl"`
}

// paymentsOpenFor — можно ли этому посетителю платить. Тестовый магазин
// принимает общеизвестные тестовые карты, поэтому в тестовом режиме платить
// может только администратор: иначе бонусы доставались бы даром.
func (s *Server) paymentsOpenFor(u *store.User) bool {
	if !s.yookassa.Enabled() {
		return false
	}
	return !s.yookassa.TestMode() || s.testPayer(u)
}

// testPayer — может ли аккаунт платить в тестовом магазине: администратор или
// проверяющий ЮKassa из YOOKASSA_TEST_PAYERS.
func (s *Server) testPayer(u *store.User) bool {
	if u == nil {
		return false
	}
	if u.IsAdmin {
		return true
	}
	if s.cfg == nil {
		return false
	}
	email := store.NormalizeEmail(u.Email)
	for _, payer := range s.cfg.YooKassaTestPayers {
		if store.NormalizeEmail(payer) == email {
			return true
		}
	}
	return false
}

type donationAvailability struct {
	Available          bool `json:"available"`
	TestMode           bool `json:"testMode"`
	MonthlyAvailable   bool `json:"monthlyAvailable"`
	GuestLinkAvailable bool `json:"guestLinkAvailable"`
}

func (s *Server) handleDonationAvailability(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	writeJSON(w, http.StatusOK, donationAvailability{
		Available: s.paymentsOpenFor(u),
		// Режим магазина видят только те, кому он открыт.
		TestMode:           s.testPayer(u) && s.yookassa.TestMode(),
		MonthlyAvailable:   s.paymentsOpenFor(u) && s.cfg != nil && s.cfg.YooKassaRecurring,
		GuestLinkAvailable: s.mailer.Enabled(),
	})
}

func (s *Server) handleCreateDonation(w http.ResponseWriter, r *http.Request) {
	if !s.paymentsOpenFor(userFrom(r.Context())) {
		writeError(w, http.StatusServiceUnavailable, codeUpstream,
			"Оплата временно недоступна. Попробуй чуть позже.")
		return
	}
	var req createDonationRequest
	if err := decodeJSON(w, r, &req, 4<<10); err != nil {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Не удалось прочитать запрос.")
		return
	}
	if req.AmountRubles < minDonationRubles || req.AmountRubles > maxDonationRubles {
		writeError(w, http.StatusBadRequest, codeBadRequest,
			"Сумма должна быть от 50 до 100 000 ₽.")
		return
	}
	name := strings.Join(strings.Fields(req.Name), " ")
	recoveryEmail := store.NormalizeEmail(req.RecoveryEmail)
	if recoveryEmail != "" && (store.ValidateEmail(recoveryEmail) != nil || !s.mailer.Enabled()) {
		writeError(w, 400, codeBadRequest, "Проверь почту или продолжи без отправки ссылки.")
		return
	}
	if req.Monthly && (userFrom(r.Context()) == nil || !req.MonthlyConsent || !s.cfg.YooKassaRecurring) {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Для ежемесячной поддержки войди в аккаунт и подтверди условия автоплатежа.")
		return
	}
	if len([]rune(req.Message)) > 300 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Сообщение — не длиннее 300 знаков.")
		return
	}
	if len([]rune(name)) > 60 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Имя для списка — не длиннее 60 знаков.")
		return
	}

	in := store.NewDonation{
		PublicName:    name,
		ShowPublic:    req.ShowPublic && name != "",
		Message:       strings.TrimSpace(req.Message),
		AmountKopecks: req.AmountRubles * 100,
		ShowAmount:    req.ShowPublic && req.ShowAmount && name != "",
		ShowMessage:   req.ShowPublic && req.ShowMessage && name != "",
	}
	if u := userFrom(r.Context()); u != nil {
		in.UserID = &u.ID
	}
	d, err := s.store.CreateDonation(r.Context(), in)
	if err != nil {
		slog.Error("создание доната", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось начать оплату.")
		return
	}

	if req.Monthly {
		if err := s.store.CreateSupportSubscription(r.Context(), d); err != nil {
			slog.Error("создание ежемесячной поддержки", "err", err)
			writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось начать оплату.")
			return
		}
	}
	if d.UserID == nil {
		if err := s.prepareGuestDonation(w, r, d.ID, recoveryEmail); err != nil {
			slog.Error("сохранение подтверждения гостевой поддержки", "err", err)
			writeError(w, 500, codeInternal, "Не удалось начать оплату. Попробуй ещё раз.")
			return
		}
	}
	payment, err := s.yookassa.CreateWithSaving(r.Context(), d.ID.String(),
		yookassa.RUB(d.AmountKopecks),
		"Поддержка проекта Читавук",
		s.cfg.WebURL+"/support/thanks?d="+d.ID.String(),
		map[string]string{"donation_id": d.ID.String()},
		req.Monthly,
	)
	if err != nil || payment.Confirmation == nil || payment.Confirmation.ConfirmationURL == "" {
		slog.Error("ЮKassa: создание платежа", "err", err, "donation", d.ID)
		if _, cancelErr := s.store.SetDonationStatus(r.Context(), d.ID, "canceled", nil); cancelErr != nil {
			slog.Error("отмена несостоявшегося доната", "err", cancelErr)
		}
		writeError(w, http.StatusBadGateway, codeUpstream,
			"Платёжный сервис не ответил. Попробуй ещё раз через минуту.")
		return
	}
	if err := s.store.SetDonationPaymentID(r.Context(), d.ID, payment.ID); err != nil {
		slog.Error("сохранение id платежа", "err", err, "donation", d.ID)
		// Не отправляем человека оплачивать запись, которую резервная сверка
		// не сможет найти, если уведомление тоже потеряется.
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось начать оплату. Попробуй ещё раз чуть позже.")
		return
	}
	writeJSON(w, http.StatusOK, createDonationResponse{
		ID:              d.ID.String(),
		ConfirmationURL: payment.Confirmation.ConfirmationURL,
	})
}

type donationStatusView struct {
	Status        string `json:"status"`
	AmountKopecks int64  `json:"amountKopecks"`
	PublicName    string `json:"publicName"`
	ShowPublic    bool   `json:"showPublic"`
	HasAccount    bool   `json:"hasAccount"`
	// TotalKopecks — вся оплаченная поддержка: у аккаунта по всем платежам,
	// у гостя — только этот платёж.
	TotalKopecks int64 `json:"totalKopecks"`
	// Unlocked — сумма дошла до порога и бонусы открыты.
	Unlocked         bool  `json:"unlocked"`
	ThresholdKopecks int64 `json:"thresholdKopecks"`
}

// handleDonationStatus отвечает странице благодарности. Если уведомление ещё
// не дошло, статус спрашивается у ЮKassa напрямую.
func (s *Server) handleDonationStatus(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, codeNotFound, "Платёж не найден.")
		return
	}
	d, err := s.store.DonationByID(r.Context(), id)
	if errors.Is(err, store.ErrDonationNotFound) {
		writeError(w, http.StatusNotFound, codeNotFound, "Платёж не найден.")
		return
	}
	if err != nil {
		slog.Error("чтение доната", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось проверить платёж.")
		return
	}
	if d.Status == "pending" && d.ProviderPaymentID != "" && s.yookassa.Enabled() {
		if fresh, err := s.syncPayment(r.Context(), d.ProviderPaymentID); err == nil && fresh != nil {
			d = fresh
		}
	}
	view := donationStatusView{
		Status:           d.Status,
		AmountKopecks:    d.AmountKopecks,
		PublicName:       d.PublicName,
		ShowPublic:       d.ShowPublic,
		HasAccount:       d.UserID != nil,
		ThresholdKopecks: store.SupporterThresholdKopecks,
	}
	if d.Status == "succeeded" {
		view.TotalKopecks = d.AmountKopecks
		if d.UserID != nil {
			if total, err := s.store.UserDonationTotal(r.Context(), *d.UserID); err == nil {
				view.TotalKopecks = total
			} else {
				slog.Error("сумма поддержки аккаунта", "err", err)
			}
		}
		view.Unlocked = view.TotalKopecks >= store.SupporterThresholdKopecks
	}
	writeJSON(w, http.StatusOK, view)
}

type yooKassaNotification struct {
	Event  string `json:"event"`
	Object struct {
		ID string `json:"id"`
	} `json:"object"`
}

// handleYooKassaNotification принимает уведомление, но доверяет только ответу
// API на перезапрос: у уведомлений ЮKassa нет подписи. Код, отличный от 200,
// заставит ЮKassa повторить доставку.
func (s *Server) handleYooKassaNotification(w http.ResponseWriter, r *http.Request) {
	var n yooKassaNotification
	if err := decodeJSON(w, r, &n, 64<<10); err != nil || n.Object.ID == "" {
		writeError(w, http.StatusBadRequest, codeBadRequest, "bad notification")
		return
	}
	if !s.yookassa.Enabled() {
		writeError(w, http.StatusServiceUnavailable, codeUpstream, "disabled")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 40*time.Second)
	defer cancel()

	paymentID := n.Object.ID
	if strings.HasPrefix(n.Event, "refund.") {
		refund, err := s.yookassa.Refund(ctx, n.Object.ID)
		if err != nil {
			slog.Error("ЮKassa: перезапрос возврата", "err", err, "refund", n.Object.ID)
			writeError(w, http.StatusBadGateway, codeUpstream, "retry")
			return
		}
		paymentID = refund.PaymentID
	}
	if _, err := s.syncPayment(ctx, paymentID); err != nil {
		slog.Error("ЮKassa: обработка уведомления", "err", err, "event", n.Event, "payment", paymentID)
		writeError(w, http.StatusBadGateway, codeUpstream, "retry")
		return
	}
	w.WriteHeader(http.StatusOK)
}

// syncPayment приводит донат к статусу платежа в ЮKassa. Неизвестный платёж
// не ошибка: это может быть оплата не отсюда.
func (s *Server) syncPayment(ctx context.Context, paymentID string) (*store.Donation, error) {
	p, err := s.yookassa.Payment(ctx, paymentID)
	if err != nil {
		return nil, err
	}
	d, err := s.donationForPayment(ctx, p)
	if errors.Is(err, store.ErrDonationNotFound) {
		slog.Warn("ЮKassa: платёж без доната", "payment", p.ID)
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if p.Test && !d.IsTest {
		if err := s.store.MarkDonationTest(ctx, d.ID); err != nil {
			return nil, err
		}
		d.IsTest = true
	}

	paid, err := p.Amount.Kopecks()
	if err != nil || paid != d.AmountKopecks || p.Amount.Currency != "RUB" {
		slog.Error("ЮKassa: сумма не совпадает", "payment", p.ID, "amount", p.Amount, "want", d.AmountKopecks)
		return d, nil
	}

	status := ""
	var paidAt *time.Time
	switch {
	case p.RefundedAmount != nil && p.RefundedAmount.Value != "" && p.RefundedAmount.Value != "0.00":
		status = "refunded"
	case p.Status == "succeeded" && p.Paid:
		status = "succeeded"
		paidAt = p.CapturedAt
		if paidAt == nil {
			now := time.Now()
			paidAt = &now
		}
	case p.Status == "canceled":
		status = "canceled"
	}
	if status == "" {
		return d, nil
	}
	if status != d.Status {
		d, err = s.store.SetDonationStatus(ctx, d.ID, status, paidAt)
		if err != nil {
			return nil, err
		}
	}
	methodID, saved := "", false
	if p.PaymentMethod != nil {
		methodID, saved = p.PaymentMethod.ID, p.PaymentMethod.Saved
	}
	if err := s.store.SyncSupportSubscription(ctx, d, methodID, saved); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *Server) donationForPayment(ctx context.Context, p *yookassa.Payment) (*store.Donation, error) {
	d, err := s.store.DonationByPaymentID(ctx, p.ID)
	if !errors.Is(err, store.ErrDonationNotFound) {
		return d, err
	}
	// id платежа мог не сохраниться, если запрос оборвался сразу после оплаты.
	id, parseErr := uuid.Parse(p.Metadata["donation_id"])
	if parseErr != nil {
		return nil, store.ErrDonationNotFound
	}
	d, err = s.store.DonationByID(ctx, id)
	if err == nil && d.ProviderPaymentID == "" {
		if setErr := s.store.SetDonationPaymentID(ctx, d.ID, p.ID); setErr != nil {
			return nil, setErr
		}
		d.ProviderPaymentID = p.ID
	}
	return d, err
}

func (s *Server) handleSupporters(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.Supporters(r.Context(), 500)
	if err != nil {
		slog.Error("список поддержавших", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить список.")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	spot, err := s.store.Spotlight(r.Context(), time.Now())
	if err != nil {
		slog.Warn("благодарность дня", "err", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"supporters": list, "spotlight": spot})
}

type adminDonationsResponse struct {
	Month          string           `json:"month"`
	Donations      []store.Donation `json:"donations"`
	PaidKopecks    int64            `json:"paidKopecks"`
	RefundKopecks  int64            `json:"refundKopecks"`
	PaymentEnabled bool             `json:"paymentEnabled"`
}

var moscow = time.FixedZone("MSK", 3*60*60)

func (s *Server) handleAdminDonations(w http.ResponseWriter, r *http.Request) {
	month, err := time.ParseInLocation("2006-01", r.URL.Query().Get("month"), moscow)
	if err != nil {
		now := time.Now().In(moscow)
		month = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, moscow)
	}
	list, err := s.store.DonationsForMonth(r.Context(), month)
	if err != nil {
		slog.Error("донаты за месяц", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось загрузить платежи.")
		return
	}
	resp := adminDonationsResponse{
		Month: month.Format("2006-01"), Donations: list,
		PaymentEnabled: s.yookassa.Enabled(),
	}
	for _, d := range list {
		// Тестовые платежи — не доход: чеки на них не пробиваются.
		if d.IsTest {
			continue
		}
		if d.Status == "refunded" {
			resp.RefundKopecks += d.AmountKopecks
		} else {
			resp.PaidKopecks += d.AmountKopecks
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

type manualDonationRequest struct {
	Email        string `json:"email"`
	AmountRubles int64  `json:"amountRubles"`
	Name         string `json:"name"`
	ShowPublic   bool   `json:"showPublic"`
}

// handleAdminManualDonation вносит поддержку, пришедшую мимо ЮKassa: через
// старый сбор ЮMoney или переводом.
func (s *Server) handleAdminManualDonation(w http.ResponseWriter, r *http.Request) {
	var req manualDonationRequest
	if err := decodeJSON(w, r, &req, 4<<10); err != nil || req.AmountRubles <= 0 {
		writeError(w, http.StatusBadRequest, codeBadRequest, "Укажи сумму в рублях.")
		return
	}
	in := store.NewDonation{
		PublicName:    strings.Join(strings.Fields(req.Name), " "),
		AmountKopecks: req.AmountRubles * 100,
		Source:        "manual",
	}
	in.ShowPublic = req.ShowPublic && in.PublicName != ""
	if email := strings.TrimSpace(req.Email); email != "" {
		u, err := s.store.UserByEmail(r.Context(), email)
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, codeNotFound, "Аккаунта с такой почтой нет.")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось найти аккаунт.")
			return
		}
		in.UserID = &u.ID
	}
	d, err := s.store.CreateDonation(r.Context(), in)
	if err == nil {
		now := time.Now()
		d, err = s.store.SetDonationStatus(r.Context(), d.ID, "succeeded", &now)
	}
	if err != nil {
		slog.Error("ручной донат", "err", err)
		writeError(w, http.StatusInternalServerError, codeInternal, "Не удалось сохранить.")
		return
	}
	writeJSON(w, http.StatusOK, d)
}
