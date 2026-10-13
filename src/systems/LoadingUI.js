/** Keep startup and world loading progress visually and semantically in sync. */
export function setLoadingProgress(text, progress) {
    const percent = Math.max(0, Math.min(100, Math.round(progress)));
    const bar = document.getElementById('loader-bar');
    const status = document.getElementById('loader-text');
    const value = document.getElementById('loader-percent');
    const meter = document.getElementById('loader-progress');
    if (bar) bar.style.width = `${percent}%`;
    if (status) status.textContent = text;
    if (value) value.textContent = `${percent}%`;
    if (meter) {
        meter.setAttribute('aria-valuenow', String(percent));
        meter.setAttribute('aria-valuetext', `${text} ${percent}%`);
    }
}
