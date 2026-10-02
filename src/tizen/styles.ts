import css from "../styles/overlay.css";

const STYLE_ID = "nsr-tizenbrew-style";

if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}
