/**
 * NRK Subtitle Studio — TizenBrew entry point.
 *
 * TizenBrew injects this single script into tv.nrk.no on Samsung (Tizen) TVs.
 * There is no extension runtime there, so the build swaps the `platform/*`
 * modules for the versions in this folder, and the stylesheet that the Chrome
 * manifest normally injects is inlined here instead.
 */

import "./styles";
import "../content/index";
