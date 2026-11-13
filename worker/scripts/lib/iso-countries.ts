// ISO 3166-1 alpha-2: the 249 officially assigned codes. Names come from CLDR via the runtime's
// Intl.DisplayNames (English and Hebrew), so they are standard and need no hand translation.
// CLDR also knows non-country codes (EU, UN, XK, ...); this list is what keeps those out.
export type CountryRow = [code: string, en: string, he: string];

export const ISO_3166_1 = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");
if (ISO_3166_1.length !== 249 || new Set(ISO_3166_1).size !== 249) throw new Error(`ISO list should be 249 unique codes, got ${ISO_3166_1.length}`);
const regionEn = new Intl.DisplayNames(["en"], { type: "region" });
const regionHe = new Intl.DisplayNames(["he"], { type: "region" });
export const ISO_COUNTRIES: CountryRow[] = ISO_3166_1.map((c) => {
  const en = regionEn.of(c), he = regionHe.of(c);
  if (!en || !he || en === c || he === c) throw new Error(`No CLDR name for ${c}`);
  return [c, en, he] as CountryRow;
});

