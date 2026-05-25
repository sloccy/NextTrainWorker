import { decodeVehiclePositions, type VehicleEvent } from "./vehicles-decode.js";
import { makeConditionalFetcher } from "./conditional-fetch.js";

export const fetchVehiclePositions = makeConditionalFetcher<VehicleEvent[]>(
  {
    url: "https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb",
    decode: decodeVehiclePositions,
    label: "vehicles",
  },
  [],
);
