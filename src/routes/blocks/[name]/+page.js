import { error } from "@sveltejs/kit";
import { blockByName } from "$lib/catalogue.js";

/**
 * One page per published block, resolved from the same list the sidebar reads.
 *
 * A name that is not in the index is a 404 rather than an empty page: the nav
 * cannot link to it, so anyone arriving that way typed a URL or followed an old
 * one, and "there is no such block" is the honest answer.
 */
export function load({ params }) {
  const block = blockByName(params.name);
  if (!block) error(404, `no block named "${params.name}"`);
  return { name: block.name };
}
