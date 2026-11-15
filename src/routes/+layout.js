import { latestVersion } from "$lib/catalogue.js";
import { installBaseFor } from "$lib/install.js";

/**
 * Where *this* deployment's registry lives, so the install line is a command
 * rather than a sentence about a command.
 *
 * It is read from the request rather than configured, because the registry and
 * the browse surface are the same server: `/r` is a route in this app, so the
 * origin the reader already reached is the origin to install from. Written down
 * in a constant, it would be right for one host and quietly wrong for every
 * other one -- and wrong in the way that fails at "Registry item not found".
 *
 * The version is the newest published one, which is also what the bar's pill
 * advertises. Universal load, so a client-side navigation re-reads it too.
 */
export function load({ url }) {
  return { installBase: installBaseFor(url.origin, latestVersion) };
}
