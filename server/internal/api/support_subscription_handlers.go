package api

import (
	"context"
	"github.com/citavuk/server/internal/store"
	"github.com/citavuk/server/internal/yookassa"
	"github.com/google/uuid"
	"log/slog"
	"net/http"
	"time"
)

func (s *Server) handleSupportSubscriptions(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.SupportSubscriptions(r.Context(), userFrom(r.Context()).ID)
	if err != nil {
		writeError(w, 500, codeInternal, "Не удалось загрузить поддержку.")
		return
	}
	writeJSON(w, 200, map[string]any{"subscriptions": list})
}

func (s *Server) handleCancelSupportSubscription(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 404, codeNotFound, "Поддержка не найдена.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	if err := s.store.CancelSupportSubscription(ctx, userFrom(r.Context()).ID, id); err != nil {
		writeError(w, 404, codeNotFound, "Поддержка не найдена.")
		return
	}
	w.WriteHeader(204)
}

func (s *Server) handleModerateDonationMessage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, 400, codeBadRequest, "Неверный платёж.")
		return
	}
	var in struct {
		Approved bool `json:"approved"`
	}
	if decodeJSON(w, r, &in, 1024) != nil {
		writeError(w, 400, codeBadRequest, "Неверный запрос.")
		return
	}
	if err := s.store.ApproveDonationMessage(r.Context(), id, in.Approved); err != nil {
		writeError(w, 404, codeNotFound, "Сообщение не найдено.")
		return
	}
	w.WriteHeader(204)
}

func (s *Server) runSupportRenewals() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			if !s.yookassa.Enabled() || !s.cfg.YooKassaRecurring {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
			d, err := s.store.ChargeNextSupportSubscription(ctx, func(d *store.Donation, method string) (string, error) {
				p, err := s.yookassa.Charge(ctx, d.ID.String(), yookassa.RUB(d.AmountKopecks), method, map[string]string{"donation_id": d.ID.String()})
				if err != nil {
					return "", err
				}
				return p.ID, nil
			})
			if err != nil {
				slog.Warn("ежемесячная поддержка", "err", err)
			} else if d != nil && d.ProviderPaymentID != "" {
				if _, err = s.syncPayment(ctx, d.ProviderPaymentID); err != nil {
					slog.Warn("проверка ежемесячной поддержки", "err", err)
				}
			}
			cancel()
		}
	}
}
