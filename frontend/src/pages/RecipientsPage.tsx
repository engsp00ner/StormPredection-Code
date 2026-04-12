import { startTransition, useEffect, useState } from "react";
import { LoaderCircle, Send, Trash2, UsersRound } from "lucide-react";

import PageShell from "../components/common/PageShell";
import SectionCard from "../components/common/SectionCard";
import { Button } from "../components/ui/button";

interface Recipient {
  id: number;
  name: string;
  phone: string;
  active: boolean;
  notes: string;
  created_at: string;
}

interface RecipientsResponse {
  recipients: Recipient[];
}

interface TestSendResponse {
  log_id: number;
  status: "SUCCESS" | "FAILED" | "MANUAL_CHECK_NEEDED";
  phone: string;
  error?: string;
}

const defaultMessage = "Test from Storm Prediction System.";

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pendingRecipientId, setPendingRecipientId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRecipients() {
      const response = await fetch("/api/v1/whatsapp/recipients/");
      if (!response.ok || cancelled) {
        return;
      }
      const payload = (await response.json()) as RecipientsResponse;
      if (!cancelled) {
        setRecipients(payload.recipients);
      }
    }

    void loadRecipients();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateRecipient() {
    setError("");
    setFeedback("");

    const response = await fetch("/api/v1/whatsapp/recipients/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        phone,
        active: true,
        notes,
      }),
    });

    if (response.status === 400 || response.status === 409) {
      const payload = (await response.json()) as {
        detail?: { phone?: string[] };
        error?: string;
      };
      setError(payload.detail?.phone?.[0] ?? "Unable to create recipient.");
      return;
    }

    if (!response.ok) {
      setError("Unable to create recipient.");
      return;
    }

    const recipient = (await response.json()) as Recipient;
    startTransition(() => {
      setRecipients((current) => [recipient, ...current]);
      setName("");
      setPhone("");
      setNotes("");
      setFeedback(`Added ${recipient.name}.`);
    });
  }

  async function toggleActive(recipient: Recipient) {
    setPendingRecipientId(recipient.id);
    setFeedback("");
    const response = await fetch(`/api/v1/whatsapp/recipients/${recipient.id}/`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ active: !recipient.active }),
    });

    if (response.ok) {
      const updated = (await response.json()) as Recipient;
      setRecipients((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    }
    setPendingRecipientId(null);
  }

  async function deleteRecipient(recipient: Recipient) {
    if (!window.confirm(`Delete recipient ${recipient.name}?`)) {
      return;
    }
    setPendingRecipientId(recipient.id);
    const response = await fetch(`/api/v1/whatsapp/recipients/${recipient.id}/`, {
      method: "DELETE",
    });
    if (response.status === 204) {
      setRecipients((current) =>
        current.filter((item) => item.id !== recipient.id),
      );
      setFeedback(`Removed ${recipient.name}.`);
    }
    setPendingRecipientId(null);
  }

  async function testSend(recipient: Recipient) {
    setPendingRecipientId(recipient.id);
    setFeedback("");
    const response = await fetch("/api/v1/whatsapp/test-send/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient_id: recipient.id,
        message: defaultMessage,
      }),
    });

    const payload = (await response.json()) as TestSendResponse;
    setFeedback(
      payload.error
        ? `${recipient.name}: ${payload.status} - ${payload.error}`
        : `${recipient.name}: ${payload.status}`,
    );
    setPendingRecipientId(null);
  }

  return (
    <PageShell>
      <section className="space-y-6">
        <SectionCard
          title="Add Recipient"
          subtitle="Phone format must be E.164: +[country code][number], with no spaces or dashes."
        >
          <div className="grid gap-4 lg:grid-cols-[0.8fr_0.9fr_1fr_auto]">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-[18px] border border-white/8 bg-[#1b1b1b] px-4 py-3 text-white outline-none transition focus:border-sky-300/30"
              placeholder="Name"
            />
            <div>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-[18px] border border-white/8 bg-[#1b1b1b] px-4 py-3 text-white outline-none transition focus:border-sky-300/30"
                placeholder="+923001234567"
              />
              {error ? (
                <p className="mt-2 text-sm text-rose-300">{error}</p>
              ) : null}
            </div>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="rounded-[18px] border border-white/8 bg-[#1b1b1b] px-4 py-3 text-white outline-none transition focus:border-sky-300/30"
              placeholder="Notes"
            />
            <Button
              onClick={() => void handleCreateRecipient()}
              disabled={!name.trim() || !phone.trim()}
            >
              Add
            </Button>
          </div>
          {feedback ? <p className="mt-4 text-sm text-sky-200">{feedback}</p> : null}
        </SectionCard>

        <SectionCard
          title="Recipients Table"
          subtitle="Manage active recipients, test sends, and removal from the local alert distribution list."
          action={
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-sky-300">
              <UsersRound className="h-5 w-5" />
            </div>
          }
        >
          <div className="space-y-3">
            {recipients.length ? (
              recipients.map((recipient) => {
                const pending = pendingRecipientId === recipient.id;

                return (
                  <div
                    key={recipient.id}
                    className="grid gap-4 rounded-[22px] border border-white/8 bg-[#232323] p-4 lg:grid-cols-[0.8fr_0.9fr_0.45fr_0.4fr_0.35fr]"
                  >
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[#727272]">
                        Name
                      </p>
                      <p className="mt-2 text-sm font-semibold text-white">
                        {recipient.name}
                      </p>
                      {recipient.notes ? (
                        <p className="mt-1 text-xs text-[#8c8c8c]">
                          {recipient.notes}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[#727272]">
                        Phone
                      </p>
                      <p className="mt-2 text-sm text-white">{recipient.phone}</p>
                    </div>
                    <div className="flex items-center lg:justify-center">
                      <button
                        className={`rounded-full px-4 py-2 text-xs font-semibold tracking-[0.16em] transition ${recipient.active ? "bg-emerald-400/15 text-emerald-200" : "bg-white/8 text-[#8d8d8d]"}`}
                        onClick={() => void toggleActive(recipient)}
                        disabled={pending}
                      >
                        {recipient.active ? "ON" : "OFF"}
                      </button>
                    </div>
                    <div className="flex items-center lg:justify-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void testSend(recipient)}
                        disabled={pending}
                      >
                        {pending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center lg:justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteRecipient(recipient)}
                        disabled={pending}
                      >
                        <Trash2 className="h-4 w-4 text-rose-300" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[22px] border border-dashed border-white/8 bg-white/[0.03] p-6 text-sm text-[#8b8b8b]">
                No recipients yet. Add the first recipient above.
              </div>
            )}
          </div>
        </SectionCard>
      </section>
    </PageShell>
  );
}
