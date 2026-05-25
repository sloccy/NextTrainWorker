import { decodeAlertFeed, type ParsedAlert } from "./alerts-decode.js";
import { makeConditionalFetcher } from "./conditional-fetch.js";

export const fetchAlerts = makeConditionalFetcher<ParsedAlert[]>(
  {
    url: "https://www.rtd-denver.com/files/gtfs-rt/Alerts.pb",
    decode: decodeAlertFeed,
    label: "alerts",
  },
  [],
);
