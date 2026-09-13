import { prisma } from "./prisma.js";
import { round2 } from "./money.js";

export async function activeRule(code: string, on: Date, state = "ALL") {
  return prisma.statutoryRule.findFirst({
    where: {
      code,
      status: "ACTIVE",
      effectiveDate: { lte: on },
      OR: [{ state }, { state: "ALL" }],
    },
    orderBy: [{ state: "desc" }, { effectiveDate: "desc" }],
  });
}

export async function computeStatutory(opts: {
  basic: number;
  gross: number;
  state?: string;
  on: Date;
}) {
  const { basic, gross, on, state = "ALL" } = opts;
  const pf = await activeRule("PF", on, state);
  const esi = await activeRule("ESI", on, state);
  const pt = await activeRule("PT", on, state);
  const tds = await activeRule("TDS", on, state);
  const lwf = await activeRule("LWF", on, state);

  const pfWage = pf ? Math.min(basic, Number(pf.maximumWage) || basic) : 0;
  const pfEmployee = pf && pfWage >= Number(pf.minimumWage || 0)
    ? round2(pfWage * Number(pf.employeeRate) / 100)
    : 0;
  const pfEmployer = pf ? round2(pfWage * Number(pf.employerRate) / 100) : 0;

  const esiEligible = esi && Number(esi.threshold) > 0 ? gross <= Number(esi.threshold) : false;
  const esiEmployee = esiEligible ? round2(gross * Number(esi.employeeRate) / 100) : 0;
  const esiEmployer = esiEligible ? round2(gross * Number(esi.employerRate) / 100) : 0;

  const ptAmount = pt && gross >= Number(pt.threshold) ? Number(pt.employeeRate) : 0;
  const tdsAmount = tds ? round2(Math.max(0, gross - Number(tds.threshold)) * Number(tds.employeeRate) / 100) : 0;
  const lwfAmount = lwf && gross >= Number(lwf.threshold) ? Number(lwf.employeeRate) : 0;

  return {
    pfEmployee,
    pfEmployer,
    esiEmployee,
    esiEmployer,
    pt: ptAmount,
    tds: tdsAmount,
    lwf: lwfAmount,
  };
}
