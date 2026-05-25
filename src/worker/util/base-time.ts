import { TEMPLATE_BYTES } from "../generated/offsets.js";

export const BASE_MIDNIGHT_UTC =
  (TEMPLATE_BYTES[4]
  | (TEMPLATE_BYTES[5] << 8)
  | (TEMPLATE_BYTES[6] << 16)
  | (TEMPLATE_BYTES[7] << 24)) >>> 0;
