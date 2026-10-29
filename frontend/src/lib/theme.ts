export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "workflow-theme";
export const resolveTheme = (value: unknown): Theme => value === "dark" ? "dark" : "light";

// Runs in the document head before the first paint, independently of React hydration.
export const THEME_INIT_SCRIPT = `(function(){var t='light';try{t=localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'?'dark':'light'}catch(e){}document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t})()`;
