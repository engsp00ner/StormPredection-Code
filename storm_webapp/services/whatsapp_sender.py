from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Optional

import pywhatkit

logger = logging.getLogger("whatsapp_sender")


@dataclass(slots=True)
class SendResult:
    success: bool
    error: Optional[str] = None
    log_id: Optional[int] = None


class WhatsAppSenderService:
    WAIT_TIME_SECONDS = 20
    TAB_CLOSE_DELAY = 3
    INTER_SEND_DELAY = 25

    def send_alert(
        self,
        phone: str,
        message: str,
        alert_event_id: int | None = None,
        recipient_id: int | None = None,
        is_test: bool = False,
    ) -> SendResult:
        """
        Send a WhatsApp message through pywhatkit.

        This method never raises. It always writes a WhatsAppSendLog row and
        returns a SendResult describing the outcome.
        """
        from apps.whatsapp_integration.models import (
            WhatsAppRuntimeStatus,
            WhatsAppSendLog,
        )

        try:
            runtime_status = WhatsAppRuntimeStatus.get_singleton()

            if not runtime_status.browser_ready:
                log = WhatsAppSendLog.objects.create(
                    phone=phone,
                    message=message,
                    status=WhatsAppSendLog.Status.MANUAL_CHECK_NEEDED,
                    error_message="WhatsApp Web not confirmed as ready by operator.",
                    is_test=is_test,
                    alert_event_id=alert_event_id,
                    recipient_id=recipient_id,
                )
                logger.warning(
                    "WhatsApp send skipped because browser_ready=False for phone %s",
                    phone,
                )
                return SendResult(
                    success=False,
                    error="Browser not ready",
                    log_id=log.id,
                )

            pywhatkit.sendwhatmsg_instantly(
                phone_no=phone,
                message=message,
                wait_time=self.WAIT_TIME_SECONDS,
                tab_close=True,
                close_time=self.TAB_CLOSE_DELAY,
            )

            log = WhatsAppSendLog.objects.create(
                phone=phone,
                message=message,
                status=WhatsAppSendLog.Status.SUCCESS,
                is_test=is_test,
                alert_event_id=alert_event_id,
                recipient_id=recipient_id,
            )
            logger.info("WhatsApp sent successfully to %s", phone)
            return SendResult(success=True, log_id=log.id)

        except Exception as exc:  # noqa: BLE001 - hard boundary: this method never raises
            error_message = str(exc)[:500]
            log = WhatsAppSendLog.objects.create(
                phone=phone,
                message=message,
                status=WhatsAppSendLog.Status.FAILED,
                error_message=error_message,
                is_test=is_test,
                alert_event_id=alert_event_id,
                recipient_id=recipient_id,
            )
            logger.error("WhatsApp send failed to %s: %s", phone, exc)
            return SendResult(success=False, error=str(exc), log_id=log.id)
