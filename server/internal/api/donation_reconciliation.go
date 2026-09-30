package api

import (
	"context"
	"log/slog"
	"time"
)

// Резервный путь, если HTTP-уведомление пропущено и посетитель не вернулся.
// Использует ту же проверку статуса, суммы и магазина, что webhook.
func (s *Server) reconcilePendingDonations(ctx context.Context) {
	if !s.yookassa.Enabled() {
		return
	}
	cycle, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	donations, err := s.store.ClaimDonationChecks(cycle, 20)
	if err != nil {
		if cycle.Err() == nil {
			slog.Warn("очередь проверки поддержки", "err", err)
		}
		return
	}
	for _, d := range donations {
		if cycle.Err() != nil {
			return
		}
		check, done := context.WithTimeout(cycle, 10*time.Second)
		_, err := s.syncPayment(check, d.ProviderPaymentID)
		done()
		if err != nil && ctx.Err() == nil {
			slog.Warn("резервная проверка поддержки", "err", err, "donation", d.ID)
		}
	}
}

func (s *Server) runDonationReconciliation() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		select {
		case <-s.stop:
			cancel()
		case <-ctx.Done():
		}
	}()
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		s.reconcilePendingDonations(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
