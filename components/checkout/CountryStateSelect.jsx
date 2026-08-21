// components/checkout/CountryStateSelect.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Country, State } from "country-state-city";

const ALL_COUNTRIES = Country.getAllCountries();
const BANGLADESH = ALL_COUNTRIES.find((c) => c.isoCode === "BD");

/**
 * Country select + dependent State/Province/District select.
 *
 * Props:
 *  - country, state: current ISO country code and state name (controlled)
 *  - onChange({ country, countryName, state }): called whenever either changes.
 *    `state` is always a plain name (not a code) since it's stored as free
 *    text on the order — different countries call this level different
 *    things (state/province/district), so no single label fits everywhere.
 *  - selectClassName, labelClassName: styling hooks so this can be dropped
 *    into both the storefront checkout and the admin address editor.
 */
export default function CountryStateSelect({
  country,
  state,
  onChange,
  selectClassName = "",
  labelClassName = "",
}) {
  const resolveToCode = (value) => {
    if (!value) return "";
    if (value.length === 2) return value; // already an ISO code
    const match = ALL_COUNTRIES.find((c) => c.name.toLowerCase() === value.toLowerCase());
    return match?.isoCode || "";
  };

  const [countryCode, setCountryCode] = useState(() => resolveToCode(country) || BANGLADESH?.isoCode || "");

  // Keeps the dropdown in sync when the PARENT changes `country` from the
  // outside — e.g. the checkout page's "pick a saved address" cards swap
  // in a different address's country. Guarded against re-firing when it's
  // already showing the resolved value, so it doesn't fight the user's own
  // clicks in this component or loop against the mount-effect below.
  useEffect(() => {
    const resolved = resolveToCode(country);
    if (resolved && resolved !== countryCode) setCountryCode(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // Runs once on mount only, to hydrate the PARENT with whatever we
  // resolved/defaulted to — so submitting without ever touching this
  // control still has a real value (defaults to Bangladesh) instead of
  // leaving the parent's form state empty.
  useEffect(() => {
    const c = ALL_COUNTRIES.find((x) => x.isoCode === countryCode);
    onChange({ country: countryCode, countryName: c?.name || "", state: state || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const states = useMemo(() => (countryCode ? State.getStatesOfCountry(countryCode) : []), [countryCode]);
  const selectedCountry = ALL_COUNTRIES.find((c) => c.isoCode === countryCode);

  // "district" reads more naturally for Bangladesh; everywhere else this is
  // genuinely a state/province — small touch, no functional difference.
  const stateLabel = countryCode === "BD" ? "District" : "State / Province";

  const handleCountryChange = (isoCode) => {
    setCountryCode(isoCode);
    const c = ALL_COUNTRIES.find((x) => x.isoCode === isoCode);
    onChange({ country: isoCode, countryName: c?.name || "", state: "" });
  };

  const handleStateChange = (stateName) => {
    onChange({ country: countryCode, countryName: selectedCountry?.name || "", state: stateName });
  };

  return (
    <>
      <div>
        <label className={labelClassName}>Country</label>
        <select className={selectClassName} value={countryCode} onChange={(e) => handleCountryChange(e.target.value)}>
          {!countryCode && <option value="">Select country...</option>}
          {BANGLADESH && (
            <option value={BANGLADESH.isoCode}>{BANGLADESH.flag} {BANGLADESH.name}</option>
          )}
          <option disabled>──────────</option>
          {ALL_COUNTRIES.filter((c) => c.isoCode !== "BD").map((c) => (
            <option key={c.isoCode} value={c.isoCode}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClassName}>{stateLabel}</label>
        {states.length > 0 ? (
          <select className={selectClassName} value={state || ""} onChange={(e) => handleStateChange(e.target.value)}>
            <option value="">Select {stateLabel.toLowerCase()}...</option>
            {states.map((s) => (
              <option key={s.isoCode} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          // some small countries have no state/province subdivisions in the
          // dataset — fall back to free text instead of an empty dropdown
          <input
            className={selectClassName}
            placeholder={stateLabel}
            value={state || ""}
            onChange={(e) => handleStateChange(e.target.value)}
          />
        )}
      </div>
    </>
  );
}
