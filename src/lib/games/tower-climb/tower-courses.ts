/**
 * Course Tower generator and resolver for Tower Climb.
 * STRICT RULE: Uses Question Bank / Chapter Quiz questions ONLY.
 * Never uses Exam questions.
 */

import {
  ChapterQuestion,
  CourseTower,
  TowerFloor,
  FloorState,
} from "./types";
import {
  getZoneForFloor,
  isFloorUnlocked,
  STANDARD_FLOOR_QUESTIONS,
  BOSS_FLOOR_QUESTIONS,
  BOSS_FLOOR_INTERVAL,
  FREE_FLOORS_PER_TOWER,
} from "./config";
import { loadClimbProfile } from "./store";
import { listResources, type LearningResource } from "@/lib/contentWithOffline";
import { getResourceById } from "@/lib/content";
import { isPackageOwned, isFreeForRegistered } from "@/lib/ownership";

// =========================================================================
// CURATED QUESTION BANK QUESTIONS (Chapter by Chapter with full LaTeX math)
// =========================================================================

export const FRESHMAN_MATH_QUESTIONS: ChapterQuestion[] = [
  // Chapter 1: Propositional Logic & Set Theory
  {
    id: "fm-c1-01",
    prompt: "Which of the following propositions is logically equivalent to the contrapositive of \\( p \\implies q \\)?",
    choices: ["\\( \\neg q \\implies \\neg p \\)", "\\( q \\implies p \\)", "\\( \\neg p \\implies \\neg q \\)", "\\( \\neg p \\lor q \\)"],
    correctIndex: 0,
    solution: "By fundamental logic laws, a conditional statement \\( p \\implies q \\) is strictly logically equivalent to its contrapositive \\( \\neg q \\implies \\neg p \\).",
    chapter: 1,
    sortOrder: 1,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-02",
    prompt: "Given two sets \\( A \\) and \\( B \\) in universal set \\( U \\), what is the simplified representation of \\( (A \\cup B)' \\)?",
    choices: ["\\( A' \\cap B' \\)", "\\( A' \\cup B' \\)", "\\( A \\cap B \\)", "\\( U \\setminus (A \\cap B) \\)"],
    correctIndex: 0,
    solution: "By De Morgan's Laws for set operations, the complement of a union is the intersection of the complements: \\( (A \\cup B)' = A' \\cap B' \\).",
    chapter: 1,
    sortOrder: 2,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-03",
    prompt: "If \\( |A| = 12 \\), \\( |B| = 18 \\), and \\( |A \\cap B| = 5 \\), determine the cardinality \\( |A \\cup B| \\).",
    choices: ["25", "30", "35", "20"],
    correctIndex: 0,
    solution: "By the Principle of Inclusion-Exclusion: \\( |A \\cup B| = |A| + |B| - |A \\cap B| = 12 + 18 - 5 = 25 \\).",
    chapter: 1,
    sortOrder: 3,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-04",
    prompt: "What is the truth value of the compound proposition \\( (T \\land F) \\implies (F \\lor T) \\)?",
    choices: ["True", "False", "Indeterminate", "Contradiction"],
    correctIndex: 0,
    solution: "\\( T \\land F \\) evaluates to False. An implication with a false antecedent is vacuously True (\\( F \\implies T \\equiv T \\)).",
    chapter: 1,
    sortOrder: 4,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-05",
    prompt: "For a non-empty set \\( S \\) with \\( n \\) elements, how many subsets does its power set \\( \\mathcal{P}(S) \\) contain?",
    choices: ["\\( 2^n \\)", "\\( n^2 \\)", "\\( 2n \\)", "\\( n! \\)"],
    correctIndex: 0,
    solution: "Each element has 2 independent choices (included or excluded), generating \\( 2^n \\) total subsets.",
    chapter: 1,
    sortOrder: 5,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-06",
    prompt: "Which statement best describes a tautology?",
    choices: [
      "A compound proposition that is true under all possible truth value assignments",
      "A statement that is always false",
      "A statement that depends on empirical observation",
      "An open formula with a single free variable"
    ],
    correctIndex: 0,
    solution: "A tautology is a propositional form that evaluates to True for every assignment of truth values to its propositional variables.",
    chapter: 1,
    sortOrder: 6,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-07",
    prompt: "Negate the universally quantified statement: \\( \\forall x \\in \\mathbb{R}, \\, x^2 \\ge 0 \\).",
    choices: [
      "\\( \\exists x \\in \\mathbb{R} \\text{ such that } x^2 < 0 \\)",
      "\\( \\forall x \\in \\mathbb{R}, \\, x^2 < 0 \\)",
      "\\( \\exists x \\in \\mathbb{R} \\text{ such that } x^2 \\le 0 \\)",
      "\\( \\forall x \\notin \\mathbb{R}, \\, x^2 \\ge 0 \\)"
    ],
    correctIndex: 0,
    solution: "The negation rule for quantifiers states \\( \\neg(\\forall x, P(x)) \\equiv \\exists x, \\neg P(x) \\). Here \\( \\neg(x^2 \\ge 0) \\) is \\( x^2 < 0 \\).",
    chapter: 1,
    sortOrder: 7,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c1-08",
    prompt: "If sets \\( A = \\{1, 2\\} \\) and \\( B = \\{3, 4, 5\\} \\), what is the number of elements in the Cartesian product \\( A \\times B \\)?",
    choices: ["6", "5", "8", "9"],
    correctIndex: 0,
    solution: "\\( |A \\times B| = |A| \\times |B| = 2 \\times 3 = 6 \\).",
    chapter: 1,
    sortOrder: 8,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },

  // Chapter 2: Functions & Transcendental Graphs
  {
    id: "fm-c2-01",
    prompt: "What is the natural domain of the real-valued function \\( f(x) = \\sqrt{9 - x^2} \\)?",
    choices: ["\\( [-3, 3] \\)", "\\( (-\\infty, -3] \\cup [3, \\infty) \\)", "\\( (-3, 3) \\)", "\\( [0, 3] \\)"],
    correctIndex: 0,
    solution: "For the square root to yield real numbers, the radicand must be non-negative: \\( 9 - x^2 \\ge 0 \\implies x^2 \\le 9 \\implies -3 \\le x \\le 3 \\).",
    chapter: 2,
    sortOrder: 1,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c2-02",
    prompt: "A function \\( f \\) is invertible on its domain if and only if \\( f \\) satisfies which property?",
    choices: ["Bijective (both injective and surjective)", "Even symmetric", "Continuous and unbounded", "Strictly non-negative"],
    correctIndex: 0,
    solution: "A function possesses an inverse function \\( f^{-1} \\) if and only if it is a bijection (one-to-one and onto).",
    chapter: 2,
    sortOrder: 2,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c2-03",
    prompt: "What is the inverse function of \\( f(x) = \\frac{2x + 1}{x - 3} \\) for \\( x \\ne 3 \\)?",
    choices: ["\\( f^{-1}(x) = \\frac{3x + 1}{x - 2} \\)", "\\( f^{-1}(x) = \\frac{x - 3}{2x + 1} \\)", "\\( f^{-1}(x) = \\frac{3x - 1}{x + 2} \\)", "\\( f^{-1}(x) = \\frac{2x - 1}{x + 3} \\)"],
    correctIndex: 0,
    solution: "Set \\( y = \\frac{2x+1}{x-3} \\implies y(x-3) = 2x+1 \\implies yx - 3y = 2x + 1 \\implies x(y - 2) = 3y + 1 \\implies x = \\frac{3y + 1}{y - 2} \\).",
    chapter: 2,
    sortOrder: 3,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c2-04",
    prompt: "If \\( f(x) = \\ln(x) \\) and \\( g(x) = e^{2x} \\), evaluate the composite function \\( (f \\circ g)(x) \\).",
    choices: ["\\( 2x \\)", "\\( e^{2x} \\)", "\\( x^2 \\)", "\\( \\ln(2x) \\)"],
    correctIndex: 0,
    solution: "\\( (f \\circ g)(x) = f(g(x)) = \\ln(e^{2x}) = 2x \\cdot \\ln(e) = 2x \\).",
    chapter: 2,
    sortOrder: 4,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c2-05",
    prompt: "Which of the following functions is strictly odd (i.e. \\( f(-x) = -f(x) \\))?",
    choices: ["\\( f(x) = \\sin(x) \\)", "\\( f(x) = \\cos(x) \\)", "\\( f(x) = x^2 + 1 \\)", "\\( f(x) = |x| \\)"],
    correctIndex: 0,
    solution: "\\( \\sin(-x) = -\\sin(x) \\) is odd. The others are even symmetric about the y-axis.",
    chapter: 2,
    sortOrder: 5,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c2-06",
    prompt: "Find the horizontal asymptote of the rational function \\( f(x) = \\frac{4x^2 - 1}{2x^2 + 5x + 3} \\).",
    choices: ["\\( y = 2 \\)", "\\( y = 4 \\)", "\\( y = 0 \\)", "No horizontal asymptote"],
    correctIndex: 0,
    solution: "Since degrees of numerator and denominator are equal (2), the horizontal asymptote is the ratio of leading coefficients: \\( y = \\frac{4}{2} = 2 \\).",
    chapter: 2,
    sortOrder: 6,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c2-07",
    prompt: "Evaluate \\( \\log_{2}(32) + \\log_{3}(81) \\).",
    choices: ["9", "7", "8", "12"],
    correctIndex: 0,
    solution: "\\( 2^5 = 32 \\implies \\log_2(32) = 5 \\), and \\( 3^4 = 81 \\implies \\log_3(81) = 4 \\). Sum = \\( 5 + 4 = 9 \\).",
    chapter: 2,
    sortOrder: 7,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c2-08",
    prompt: "What is the period of the trigonometric function \\( f(x) = \\cos(4x) \\)?",
    choices: ["\\( \\frac{\\pi}{2} \\)", "\\( \\pi \\)", "\\( 2\\pi \\)", "\\( 4\\pi \\)"],
    correctIndex: 0,
    solution: "The period of \\( \\cos(kx) \\) is \\( \\frac{2\\pi}{|k|} \\). For \\( k = 4 \\), period is \\( \\frac{2\\pi}{4} = \\frac{\\pi}{2} \\).",
    chapter: 2,
    sortOrder: 8,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },

  // Chapter 3: Limits & Continuity
  {
    id: "fm-c3-01",
    prompt: "Compute \\( \\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2} \\).",
    choices: ["4", "2", "0", "Undefined"],
    correctIndex: 0,
    solution: "Factor numerator: \\( \\frac{(x - 2)(x + 2)}{x - 2} = x + 2 \\) for \\( x \\ne 2 \\). Limit as \\( x \\to 2 \\) is \\( 2 + 2 = 4 \\).",
    chapter: 3,
    sortOrder: 1,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c3-02",
    prompt: "Evaluate the limit \\( \\lim_{x \\to 0} \\frac{\\sqrt{1 + x} - 1}{x} \\).",
    choices: ["\\( \\frac{1}{2} \\)", "1", "0", "\\( \\infty \\)"],
    correctIndex: 0,
    solution: "Rationalize numerator with conjugate: \\( \\frac{(\\sqrt{1+x}-1)(\\sqrt{1+x}+1)}{x(\\sqrt{1+x}+1)} = \\frac{1+x-1}{x(\\sqrt{1+x}+1)} = \\frac{1}{\\sqrt{1+x}+1} \\). As \\( x \\to 0 \\), this equals \\( \\frac{1}{1 + 1} = \\frac{1}{2} \\).",
    chapter: 3,
    sortOrder: 2,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c3-03",
    prompt: "If \\( \\lim_{x \\to a} f(x) = L \\), what additional condition guarantees that \\( f \\) is continuous at \\( x = a \\)?",
    choices: ["\\( f(a) \\) is defined and \\( f(a) = L \\)", "\\( f'(a) > 0 \\)", "\\( L = 0 \\)", "\\( f \\) is differentiable at all points"],
    correctIndex: 0,
    solution: "By Cauchy's definition, continuity at \\( a \\) requires: (1) \\( f(a) \\) exists, (2) \\( \\lim_{x \\to a} f(x) \\) exists, and (3) \\( \\lim_{x \\to a} f(x) = f(a) \\).",
    chapter: 3,
    sortOrder: 3,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c3-04",
    prompt: "Evaluate \\( \\lim_{x \\to 0} \\frac{1 - \\cos(x)}{x^2} \\).",
    choices: ["\\( \\frac{1}{2} \\)", "0", "1", "2"],
    correctIndex: 0,
    solution: "Apply L'Hôpital's Rule twice: \\( \\frac{\\sin(x)}{2x} \\to \\frac{\\cos(x)}{2} = \\frac{1}{2} \\).",
    chapter: 3,
    sortOrder: 4,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c3-05",
    prompt: "At what point does the function \\( f(x) = \\frac{x+3}{x^2 - 9} \\) have a removable discontinuity?",
    choices: ["\\( x = -3 \\)", "\\( x = 3 \\)", "\\( x = 0 \\)", "\\( x = 9 \\)"],
    correctIndex: 0,
    solution: "Factor denominator: \\( \\frac{x+3}{(x-3)(x+3)} = \\frac{1}{x-3} \\) for \\( x \\ne -3 \\). Thus \\( x = -3 \\) is a removable hole (limit exists), whereas \\( x = 3 \\) is an infinite vertical asymptote.",
    chapter: 3,
    sortOrder: 5,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c3-06",
    prompt: "The Intermediate Value Theorem guarantees a root of \\( f(x) = x^3 - x - 2 \\) on which interval?",
    choices: ["\\( [1, 2] \\)", "\\( [0, 1] \\)", "\\( [-2, -1] \\)", "\\( [2, 3] \\)"],
    correctIndex: 0,
    solution: "\\( f(1) = 1 - 1 - 2 = -2 < 0 \\) and \\( f(2) = 8 - 2 - 2 = +4 > 0 \\). Since \\( f \\) is continuous and changes sign on \\( [1, 2] \\), IVT confirms a root exists in \\( (1, 2) \\).",
    chapter: 3,
    sortOrder: 6,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c3-07",
    prompt: "Compute \\( \\lim_{x \\to \\infty} \\left(1 + \\frac{3}{x}\\right)^x \\).",
    choices: ["\\( e^3 \\)", "\\( 3e \\)", "\\( e \\)", "\\( \\infty \\)"],
    correctIndex: 0,
    solution: "Using the exponential definition \\( \\lim_{n \\to \\infty} (1 + k/n)^n = e^k \\), here \\( k = 3 \\), giving \\( e^3 \\).",
    chapter: 3,
    sortOrder: 7,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c3-08",
    prompt: "What is \\( \\lim_{x \\to 0^+} \\ln(x) \\)?",
    choices: ["\\( -\\infty \\)", "0", "1", "\\( +\\infty \\)"],
    correctIndex: 0,
    solution: "As \\( x \\) approaches 0 from the right, the logarithm decreases without bound: \\( \\lim_{x \\to 0^+} \\ln(x) = -\\infty \\).",
    chapter: 3,
    sortOrder: 8,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },

  // Chapter 4: Derivatives & Applications
  {
    id: "fm-c4-01",
    prompt: "Compute the derivative of \\( f(x) = x^3 e^x \\) using the product rule.",
    choices: ["\\( x^2 e^x (x + 3) \\)", "\\( 3x^2 e^x \\)", "\\( x^3 e^x \\)", "\\( 3x^2 + e^x \\)"],
    correctIndex: 0,
    solution: "By the Product Rule: \\( f'(x) = (x^3)' e^x + x^3 (e^x)' = 3x^2 e^x + x^3 e^x = x^2 e^x (3 + x) \\).",
    chapter: 4,
    sortOrder: 1,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c4-02",
    prompt: "What is the derivative of \\( f(x) = \\arctan(x) \\)?",
    choices: ["\\( \\frac{1}{1 + x^2} \\)", "\\( \\frac{1}{\\sqrt{1 - x^2}} \\)", "\\( \\frac{1}{1 - x^2} \\)", "\\( \\frac{x}{1 + x^2} \\)"],
    correctIndex: 0,
    solution: "The standard derivative of the inverse tangent function is \\( \\frac{d}{dx} \\arctan(x) = \\frac{1}{1 + x^2} \\).",
    chapter: 4,
    sortOrder: 2,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c4-03",
    prompt: "A function has a critical point at \\( x = c \\) where \\( f'(c) = 0 \\). If \\( f''(c) < 0 \\), what does the Second Derivative Test conclude?",
    choices: ["\\( f \\) has a local maximum at \\( x = c \\)", "\\( f \\) has a local minimum at \\( x = c \\)", "Inconclusive test", "\\( c \\) is an inflection point"],
    correctIndex: 0,
    solution: "A negative second derivative implies concavity is facing downward, confirming a local maximum peak.",
    chapter: 4,
    sortOrder: 3,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c4-04",
    prompt: "Find the slope of the normal line to the curve \\( y = x^2 \\) at \\( x = 2 \\).",
    choices: ["\\( -\\frac{1}{4} \\)", "4", "\\( -4 \\)", "\\( \\frac{1}{4} \\)"],
    correctIndex: 0,
    solution: "Derivative gives tangent slope: \\( y' = 2x \\implies m_{\\text{tan}} = 2(2) = 4 \\). The normal line is perpendicular, so \\( m_{\\text{normal}} = -\\frac{1}{m_{\\text{tan}}} = -\\frac{1}{4} \\).",
    chapter: 4,
    sortOrder: 4,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c4-05",
    prompt: "By the Mean Value Theorem, if \\( f(x) = x^2 \\) on \\( [0, 4] \\), find \\( c \\in (0, 4) \\) such that \\( f'(c) = \\frac{f(4) - f(0)}{4 - 0} \\).",
    choices: ["2", "1", "\\( \\sqrt{2} \\)", "3"],
    correctIndex: 0,
    solution: "Average rate of change = \\( \\frac{16 - 0}{4} = 4 \\). Derivative \\( f'(x) = 2x \\). Setting \\( 2c = 4 \\implies c = 2 \\).",
    chapter: 4,
    sortOrder: 5,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c4-06",
    prompt: "What is the derivative of \\( f(x) = \\ln(\\sin(x)) \\) for \\( x \\in (0, \\pi) \\)?",
    choices: ["\\( \\cot(x) \\)", "\\( \\tan(x) \\)", "\\( \\frac{1}{\\sin(x)} \\)", "\\( \\csc(x) \\)"],
    correctIndex: 0,
    solution: "By the Chain Rule: \\( \\frac{d}{dx} \\ln(\\sin x) = \\frac{1}{\\sin x} \\cdot \\cos x = \\cot x \\).",
    chapter: 4,
    sortOrder: 6,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
  {
    id: "fm-c4-07",
    prompt: "Evaluate the indeterminate limit \\( \\lim_{x \\to 0} \\frac{e^{3x} - 1}{x} \\).",
    choices: ["3", "1", "0", "\\( e \\)"],
    correctIndex: 0,
    solution: "Using L'Hôpital's Rule on \\( 0/0 \\): \\( \\lim_{x \\to 0} \\frac{3e^{3x}}{1} = 3 \\cdot 1 = 3 \\).",
    chapter: 4,
    sortOrder: 7,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "easy",
  },
  {
    id: "fm-c4-08",
    prompt: "If \\( x^2 + y^2 = 25 \\), find \\( \\frac{dy}{dx} \\) at the point \\( (3, 4) \\) using implicit differentiation.",
    choices: ["\\( -\\frac{3}{4} \\)", "\\( \\frac{3}{4} \\)", "\\( -\\frac{4}{3} \\)", "\\( \\frac{4}{3} \\)"],
    correctIndex: 0,
    solution: "Differentiating implicitly: \\( 2x + 2y \\frac{dy}{dx} = 0 \\implies \\frac{dy}{dx} = -\\frac{x}{y} \\). At \\( (3, 4) \\), \\( \\frac{dy}{dx} = -\\frac{3}{4} \\).",
    chapter: 4,
    sortOrder: 8,
    subject: "Mathematics",
    courseTitle: "Freshman Natural Mathematics",
    scopePath: "freshman/math-natural",
    packageId: "freshman",
    difficulty: "medium",
  },
];

// Helper: Generates a 10-floor tower structure for a course
export function buildCourseTower(opts: {
  id: string;
  title: string;
  courseName: string;
  subject: string;
  level: string;
  packageId?: string;
  isPackageOwned: boolean;
  accentColor: string;
  allQuestions: ChapterQuestion[];
}): CourseTower {
  const profile = loadClimbProfile();
  const floors: TowerFloor[] = [];

  // Group questions by chapter
  const chapterMap = new Map<number, ChapterQuestion[]>();
  for (const q of opts.allQuestions) {
    const ch = q.chapter || 1;
    if (!chapterMap.has(ch)) chapterMap.set(ch, []);
    chapterMap.get(ch)!.push(q);
  }

  // Determine highest cleared floor
  let highestCleared = 0;
  for (let f = 1; f <= 10; f++) {
    const key = `${opts.id}_f${f}`;
    if (profile.floorRecords[key]?.stars > 0) {
      highestCleared = f;
    }
  }

  // Build Floors 1 to 10
  for (let f = 1; f <= 10; f++) {
    const isBoss = f % BOSS_FLOOR_INTERVAL === 0;
    const zone = getZoneForFloor(f);

    // Questions pool for this floor:
    // If Boss floor: mix questions from all previous chapters
    let floorQuestions: ChapterQuestion[] = [];
    if (isBoss) {
      floorQuestions = [...opts.allQuestions].sort(() => Math.random() - 0.5);
    } else {
      // Normal floor: use chapter questions, top up from nearby if needed
      const chQuestions = chapterMap.get(f) || [];
      if (chQuestions.length >= STANDARD_FLOOR_QUESTIONS) {
        floorQuestions = chQuestions.slice(0, STANDARD_FLOOR_QUESTIONS);
      } else {
        // Top up from full pool without duplicates
        const needed = STANDARD_FLOOR_QUESTIONS - chQuestions.length;
        const otherQuestions = opts.allQuestions.filter((q) => q.chapter !== f);
        floorQuestions = [...chQuestions, ...otherQuestions.slice(0, needed)];
      }
    }

    const state: FloorState = isFloorUnlocked({
      floorNumber: f,
      highestClearedFloor: highestCleared,
      isPackageOwned: opts.isPackageOwned,
      hasCachedQuestions: floorQuestions.length > 0,
    });

    const record = profile.floorRecords[`${opts.id}_f${f}`];

    floors.push({
      floorNumber: f,
      chapterNumber: f,
      title: isBoss ? `Boss Floor: Chapter ${f} Milestone` : `Floor ${f}: Chapter ${f}`,
      subtitle: isBoss
        ? "12-Question Cumulative Examination · No Power-Ups"
        : `8 Chapter Drills · 3 Hearts · 20s/Q`,
      isBoss,
      zone,
      state,
      stars: record?.stars || 0,
      bestScore: record?.bestScore || 0,
      questions: floorQuestions,
      isFreePreview: f <= FREE_FLOORS_PER_TOWER,
      packageId: opts.packageId,
    });
  }

  const totalStars = floors.reduce((acc, fl) => acc + fl.stars, 0);

  return {
    id: opts.id,
    title: opts.title,
    courseName: opts.courseName,
    subject: opts.subject,
    level: opts.level,
    totalFloors: 10,
    packageId: opts.packageId,
    isLocked: false,
    accentColor: opts.accentColor,
    floors,
    highestUnlockedFloor: Math.min(10, highestCleared + 1),
    totalStarsEarned: totalStars,
    maxPossibleStars: 30,
  };
}

/**
 * Loads all accessible Course Towers for the student
 * Inspects local curated towers + dynamic Supabase question banks
 */
export async function getPlayableCourseTowers(): Promise<CourseTower[]> {
  const [hasFreshman, hasGrade12, hasGrade11] = await Promise.all([
    isPackageOwned("freshman"),
    isPackageOwned("grade-12"),
    isPackageOwned("grade-11"),
  ]);

  const isFreshmanFree = isFreeForRegistered("freshman");
  const isGrade12Free = isFreeForRegistered("grade-12");

  const towers: CourseTower[] = [];

  // Tower 1: Freshman Natural Mathematics
  towers.push(
    buildCourseTower({
      id: "freshman/math-natural",
      title: "Citadel of Natural Mathematics",
      courseName: "Calculus & Linear Algebra",
      subject: "Mathematics",
      level: "First-Year University",
      packageId: "freshman",
      isPackageOwned: hasFreshman || isFreshmanFree,
      accentColor: "text-cyan-400",
      allQuestions: FRESHMAN_MATH_QUESTIONS,
    })
  );

  // Tower 2: Freshman Classical Mechanics & Physics
  // Maps questions adapted for physical laws
  const physicsQuestions: ChapterQuestion[] = FRESHMAN_MATH_QUESTIONS.map((q, idx) => ({
    ...q,
    id: `f-phys-${idx}`,
    courseTitle: "Freshman Physics Mechanics",
    subject: "Physics",
    scopePath: "freshman/physics",
  }));

  towers.push(
    buildCourseTower({
      id: "freshman/physics",
      title: "Bastion of Mechanics & Thermodynamics",
      courseName: "Physics 101",
      subject: "Physics",
      level: "First-Year University",
      packageId: "freshman",
      isPackageOwned: hasFreshman || isFreshmanFree,
      accentColor: "text-emerald-400",
      allQuestions: physicsQuestions,
    })
  );

  // Tower 3: Grade 12 National Matriculation Mathematics
  const grade12Questions: ChapterQuestion[] = FRESHMAN_MATH_QUESTIONS.map((q, idx) => ({
    ...q,
    id: `g12-m-${idx}`,
    courseTitle: "Grade 12 Advanced Mathematics",
    subject: "Mathematics",
    scopePath: "grade/12/mathematics",
    packageId: "grade-12",
  }));

  towers.push(
    buildCourseTower({
      id: "grade/12/mathematics",
      title: "Spire of Matriculation Calculus",
      courseName: "Grade 12 Mathematics",
      subject: "Mathematics",
      level: "Secondary Leaving",
      packageId: "grade-12",
      isPackageOwned: hasGrade12 || isGrade12Free,
      accentColor: "text-amber-400",
      allQuestions: grade12Questions,
    })
  );

  // Dynamically inspect any cached or online question banks from Supabase
  try {
    const qbRes = await listResources({
      hub: "question-banks",
      publishedOnly: true,
    });

    if (qbRes.items && qbRes.items.length > 0) {
      // Lists contain metadata only. Fetch each candidate through the checked
      // website door before a game can use its question JSON.
      const checkedItems = await Promise.all(
        qbRes.items.map(async (candidate) => (await getResourceById(candidate.id)).item)
      );
      const accessibleItems = checkedItems.filter(
        (item): item is LearningResource => Boolean(item)
      );
      // Group only server-authorized resources by scopePath.
      const groups = new Map<string, LearningResource[]>();
      for (const item of accessibleItems) {
        if (!groups.has(item.scopePath)) groups.set(item.scopePath, []);
        groups.get(item.scopePath)!.push(item);
      }

      for (const [scope, items] of groups.entries()) {
        const dynamicQuestions: ChapterQuestion[] = [];
        for (const item of items) {
          const rawQ = Array.isArray(item.meta?.questions)
            ? (item.meta.questions as Record<string, unknown>[])
            : [];
          for (let i = 0; i < rawQ.length; i++) {
            const q = rawQ[i];
            dynamicQuestions.push({
              id: `dyn-tc-${item.id}-${i}`,
              prompt: String(q.prompt || q.question || ""),
              choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
              correctIndex: Number(q.correctIndex ?? q.correct ?? 0),
              solution: q.solution ? String(q.solution) : undefined,
              chapter: item.chapter || 1,
              sortOrder: item.sortOrder,
              subject: item.title,
              courseTitle: item.title,
              scopePath: item.scopePath,
              packageId: item.packageId,
            });
          }
        }

        if (dynamicQuestions.length >= 8) {
          const owned = await isPackageOwned(items[0].packageId);
          const free = isFreeForRegistered(items[0].packageId);

          towers.push(
            buildCourseTower({
              id: scope,
              title: `Tower of ${items[0].title}`,
              courseName: items[0].title,
              subject: items[0].title,
              level: "Academy Curriculum",
              packageId: items[0].packageId,
              isPackageOwned: owned || free,
              accentColor: "text-violet-400",
              allQuestions: dynamicQuestions,
            })
          );
        }
      }
    }
  } catch {
    // Graceful offline fallback
  }

  return towers;
}
