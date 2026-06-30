const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarEvent {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  start: string | null;
  end: string | null;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string | null;
}

function parseEventTime(
  value: { dateTime?: string; date?: string } | undefined,
): { iso: string | null; allDay: boolean } {
  if (!value) return { iso: null, allDay: false };
  if (value.dateTime) return { iso: value.dateTime, allDay: false };
  if (value.date) return { iso: value.date, allDay: true };
  return { iso: null, allDay: false };
}

export async function listUpcomingCalendarEvents(
  accessToken: string,
  opts?: { days?: number; maxResults?: number },
): Promise<GoogleCalendarEvent[]> {
  const days = opts?.days ?? 14;
  const maxResults = opts?.maxResults ?? 30;
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

  const listRes = await fetch(`${CALENDAR_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    throw new Error(
      `Calendar list failed: ${listRes.status} ${await listRes.text()}`,
    );
  }

  const listBody = (await listRes.json()) as {
    items?: { id?: string; summary?: string; selected?: boolean }[];
  };
  const calendars = (listBody.items ?? []).filter((c) => c.id);
  const primary =
    calendars.find((c) => c.selected) ?? calendars[0] ?? { id: "primary" };

  const targets =
    calendars.length > 0
      ? calendars.slice(0, 5)
      : [{ id: "primary", summary: "Principal" }];

  const out: GoogleCalendarEvent[] = [];

  for (const cal of targets) {
    const calId = encodeURIComponent(cal.id ?? "primary");
    const url = new URL(`${CALENDAR_BASE}/calendars/${calId}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(Math.ceil(maxResults / targets.length)));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) continue;

    const body = (await r.json()) as {
      items?: {
        id?: string;
        summary?: string;
        description?: string;
        location?: string;
        htmlLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    };

    for (const ev of body.items ?? []) {
      if (!ev.id) continue;
      const start = parseEventTime(ev.start);
      const end = parseEventTime(ev.end);
      out.push({
        id: ev.id,
        summary: ev.summary ?? null,
        description: ev.description ?? null,
        location: ev.location ?? null,
        htmlLink: ev.htmlLink ?? null,
        start: start.iso,
        end: end.iso,
        allDay: start.allDay,
        calendarId: cal.id ?? "primary",
        calendarSummary: cal.summary ?? primary.summary ?? null,
      });
    }
  }

  out.sort((a, b) => {
    const ta = a.start ? new Date(a.start).getTime() : 0;
    const tb = b.start ? new Date(b.start).getTime() : 0;
    return ta - tb;
  });

  return out.slice(0, maxResults);
}
