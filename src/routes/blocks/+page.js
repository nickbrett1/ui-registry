import { redirect } from "@sveltejs/kit";

/**
 * The gallery used to live here. It is now the landing page, because the blocks
 * are the reason to open the registry at all — asking a phone user to press a
 * button to reach the only content that mattered was a wasted tap, and on a home
 * screen the button was under the status bar anyway.
 *
 * The path is kept so old links (the README, a bookmark) still land somewhere.
 */
export const load = () => {
  redirect(308, "/");
};
