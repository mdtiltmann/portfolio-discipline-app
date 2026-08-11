// Retirement / FI modelling: withdrawal-survival simulation and "when can I
// stop contributing" calculation. Pure functions, no I/O.

export interface WithdrawalSimInput {
  startingPortfolio: number;
  retirementAge: number;
  endAge: number;
  monthlyWithdrawal: number; // in today's money if inflationAdjusted, else nominal
  inflationAdjusted: boolean;
  inflationPct: number; // annual, used only if inflationAdjusted
  annualReturnPct: number; // nominal annual return assumption during retirement
  pensionMonthly: number; // state/private pension amount, once it starts
  pensionStartAge: number;
  partTimeIncomeMonthly: number; // additional income, assumed to run for partTimeIncomeYears from retirement
  partTimeIncomeYears: number;
}

export interface WithdrawalSimYear {
  age: number;
  startBalance: number;
  endBalance: number;
  withdrawal: number;
  income: number; // pension + part-time income received that year
}

export interface WithdrawalSimResult {
  survives: boolean;
  endingBalance: number; // balance at endAge if it survives (>=0 throughout)
  depletionAge: number | null; // age balance first hits <=0, if it doesn't survive
  years: WithdrawalSimYear[];
}

/**
 * Year-by-year balance simulation from retirementAge to endAge. Withdrawal
 * is net of pension/part-time income (i.e. only the shortfall is drawn from
 * the portfolio). "Survives" means balance stays >= 0 for every year.
 */
export function simulateWithdrawalSurvival(input: WithdrawalSimInput): WithdrawalSimResult {
  const {
    startingPortfolio,
    retirementAge,
    endAge,
    monthlyWithdrawal,
    inflationAdjusted,
    inflationPct,
    annualReturnPct,
    pensionMonthly,
    pensionStartAge,
    partTimeIncomeMonthly,
    partTimeIncomeYears,
  } = input;

  const monthlyReturn = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + inflationPct / 100, 1 / 12) - 1;

  let balance = startingPortfolio;
  let withdrawalNow = monthlyWithdrawal;
  const years: WithdrawalSimYear[] = [];
  let depletionAge: number | null = null;

  for (let age = retirementAge; age <= endAge; age++) {
    const startBalance = balance;
    let yearWithdrawal = 0;
    let yearIncome = 0;

    for (let m = 0; m < 12; m++) {
      const income =
        (age >= pensionStartAge ? pensionMonthly : 0) +
        (age < retirementAge + partTimeIncomeYears ? partTimeIncomeMonthly : 0);
      const netDraw = Math.max(0, withdrawalNow - income);

      balance = balance * (1 + monthlyReturn) - netDraw;
      yearWithdrawal += netDraw;
      yearIncome += income;

      if (inflationAdjusted) withdrawalNow *= 1 + monthlyInflation;

      if (balance < 0 && depletionAge === null) {
        depletionAge = age + m / 12;
      }
    }

    years.push({ age, startBalance, endBalance: balance, withdrawal: yearWithdrawal, income: yearIncome });

    if (balance < 0 && depletionAge === null) depletionAge = age;
  }

  const survives = depletionAge === null;
  return {
    survives,
    endingBalance: survives ? balance : 0,
    depletionAge,
    years,
  };
}

export interface StopContributingInput {
  currentValue: number;
  monthlyContribution: number;
  annualIncreasePct: number;
  capMonthly: number;
  annualReturnPct: number;
  currentAge: number;
  retirementAge: number;
  targetRetirementValue: number;
}

export interface StopContributingResult {
  canStopNow: boolean;
  // Earliest year offset (from now) at which contributions could stop and
  // growth alone would still reach targetRetirementValue by retirementAge.
  earliestYearOffset: number | null;
  earliestAge: number | null;
  portfolioValueAtThatPoint: number | null;
}

/**
 * "When can I stop contributing": walk the contribution trajectory year by
 * year; at each point, check whether the current balance alone (with no
 * further contributions), compounded at annualReturnPct to retirementAge,
 * would still reach targetRetirementValue. Report the earliest such point.
 */
export function findStopContributingPoint(input: StopContributingInput): StopContributingResult {
  const {
    currentValue,
    monthlyContribution,
    annualIncreasePct,
    capMonthly,
    annualReturnPct,
    currentAge,
    retirementAge,
    targetRetirementValue,
  } = input;

  const monthlyReturn = Math.pow(1 + annualReturnPct / 100, 1 / 12) - 1;
  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  const totalMonths = yearsToRetirement * 12;

  function growsToTarget(value: number, monthsRemaining: number): boolean {
    return value * Math.pow(1 + monthlyReturn, monthsRemaining) >= targetRetirementValue;
  }

  if (growsToTarget(currentValue, totalMonths)) {
    return { canStopNow: true, earliestYearOffset: 0, earliestAge: currentAge, portfolioValueAtThatPoint: currentValue };
  }

  let value = currentValue;
  let monthly = monthlyContribution;

  for (let m = 1; m <= totalMonths; m++) {
    value = value * (1 + monthlyReturn) + monthly;
    if (m % 12 === 0) monthly = Math.min(monthly * (1 + annualIncreasePct / 100), capMonthly);

    const monthsRemaining = totalMonths - m;
    if (growsToTarget(value, monthsRemaining)) {
      const yearOffset = m / 12;
      return {
        canStopNow: false,
        earliestYearOffset: yearOffset,
        earliestAge: currentAge + yearOffset,
        portfolioValueAtThatPoint: value,
      };
    }
  }

  return { canStopNow: false, earliestYearOffset: null, earliestAge: null, portfolioValueAtThatPoint: null };
}
