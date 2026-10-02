import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HeadSaProjectValuesPanel } from "../components/dashboard/head-sa-project-values-panel";
import { DEFAULT_LANGUAGE, formatNumber, setActiveLanguage, translate } from "../i18n";

const values = {
  active: { count: 1200, estimatedRevenue: 25000000 },
  won: { count: 2, finalContractValue: 17000000 },
};
const render = (props: Partial<Parameters<typeof HeadSaProjectValuesPanel>[0]> = {}) =>
  renderToStaticMarkup(createElement(HeadSaProjectValuesPanel, {
    role: "HEAD_SA", values, loading: false, hasError: false, ...props,
  }));

assert.equal(DEFAULT_LANGUAGE, "en");
for (const role of [undefined, "SALES", "SA", "SUPER_ADMIN"]) {
  assert.equal(render({ role }), "", `${role} must not receive the HEAD_SA value panel`);
}
try {
  for (const language of ["en", "id"] as const) {
    setActiveLanguage(language);
    const html = render();
    assert(html.includes(language === "en" ? "Active project estimate" : "Estimasi proyek aktif"));
    assert(html.includes(language === "en" ? "WON project contracts" : "Kontrak proyek WON"));
    assert(html.includes(language === "en" ? "all periods" : "seluruh periode"));
    assert(html.includes(translate("dashboardPage.projectCount", { count: formatNumber(1200) })));
    for (const value of [values.active.estimatedRevenue, values.won.finalContractValue]) {
      assert(html.includes(formatNumber(value, { style: "currency", currency: "IDR", maximumFractionDigits: 0 })));
    }
    for (const [props, key] of [
      [{ loading: true }, "dashboardPage.loadingProjectValues"],
      [{ hasError: true }, "dashboardPage.projectValuesError"],
      [{ values: undefined }, "dashboardPage.projectValuesUnavailable"],
      [{ values: null }, "dashboardPage.projectValuesUnavailable"],
    ] as const) {
      const state = render(props);
      assert(state.includes(translate(key)));
      assert(!state.includes("<dl"), "loading, errors and missing data must not display valid totals");
    }
    const empty = render({ values: {
      active: { count: 0, estimatedRevenue: 0 }, won: { count: 0, finalContractValue: 0 },
    } });
    assert(empty.includes("<dl") && empty.includes(translate("dashboardPage.projectCount", { count: 0 })),
      "a successfully loaded empty scope must display zero totals");
  }
} finally {
  setActiveLanguage(DEFAULT_LANGUAGE);
}
console.log("HEAD_SA project value panel, query states and EN/ID: passed");
