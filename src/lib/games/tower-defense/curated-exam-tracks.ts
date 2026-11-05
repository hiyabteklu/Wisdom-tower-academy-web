/**
 * Curated authentic Exam datasets and question resolver for Tower Defense of Knowledge.
 * STRICT RULE: Only questions from the Exams section are permitted.
 * Never pulls from chapter question banks.
 */

import { ExamQuestion, TowerTrack } from "./types";
import { listResources, type LearningResource } from "@/lib/contentWithOffline";
import { getResourceById } from "@/lib/content";
import { isPackageOwned, isFreeForRegistered } from "@/lib/ownership";

// Curated authentic national leaving and university exit model exam questions
export const CURATED_EXAM_QUESTIONS: Record<string, ExamQuestion[]> = {
  "euee-math": [
    {
      id: "euee-math-001",
      prompt: "What is the value of the limit \\( \\lim_{x \\to 0} \\frac{\\sin(5x)}{2x} \\)?",
      choices: ["\\( \\frac{5}{2} \\)", "\\( \\frac{2}{5} \\)", "0", "1"],
      correctIndex: 0,
      solution: "Using the standard trigonometric limit identity \\( \\lim_{u \\to 0} \\frac{\\sin(u)}{u} = 1 \\), rewrite the expression as \\( \\frac{5}{2} \\cdot \\frac{\\sin(5x)}{5x} \\). As \\( x \\to 0 \\), the factor \\( \\frac{\\sin(5x)}{5x} \\to 1 \\), yielding \\( \\frac{5}{2} \\times 1 = \\frac{5}{2} \\).",
      difficulty: "easy",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-002",
      prompt: "If \\( f(x) = x^3 - 3x^2 + 2 \\), at what values of \\( x \\) does \\( f(x) \\) have local extrema?",
      choices: ["\\( x = 0 \\) and \\( x = 2 \\)", "\\( x = 1 \\) and \\( x = -1 \\)", "\\( x = 0 \\) and \\( x = -2 \\)", "\\( x = 3 \\) and \\( x = 0 \\)"],
      correctIndex: 0,
      solution: "Find the first derivative: \\( f'(x) = 3x^2 - 6x \\). Setting \\( f'(x) = 0 \\) gives \\( 3x(x - 2) = 0 \\), so critical points occur at \\( x = 0 \\) and \\( x = 2 \\). Checking the second derivative \\( f''(x) = 6x - 6 \\): \\( f''(0) = -6 < 0 \\) (local maximum), and \\( f''(2) = 6 > 0 \\) (local minimum).",
      difficulty: "medium",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-003",
      prompt: "Compute the definite integral \\( \\int_{0}^{2} (3x^2 - 2x + 1) \\, dx \\).",
      choices: ["6", "8", "4", "10"],
      correctIndex: 0,
      solution: "The antiderivative is \\( F(x) = x^3 - x^2 + x \\). Evaluating from 0 to 2 gives \\( F(2) - F(0) = (2^3 - 2^2 + 2) - 0 = (8 - 4 + 2) = 6 \\).",
      difficulty: "medium",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-004",
      prompt: "Given two orthogonal 3D vectors \\( \\mathbf{u} = (2, -1, k) \\) and \\( \\mathbf{v} = (3, 4, 1) \\), determine the scalar value of \\( k \\).",
      choices: ["\\( -2 \\)", "2", "\\( -10 \\)", "10"],
      correctIndex: 0,
      solution: "Two non-zero vectors are orthogonal if and only if their dot product vanishes: \\( \\mathbf{u} \\cdot \\mathbf{v} = 0 \\). Therefore, \\( (2)(3) + (-1)(4) + (k)(1) = 0 \\implies 6 - 4 + k = 0 \\implies 2 + k = 0 \\implies k = -2 \\).",
      difficulty: "medium",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-005",
      prompt: "What is the inverse of the matrix \\( A = \\begin{pmatrix} 2 & 1 \\\\ 5 & 3 \\end{pmatrix} \\)?",
      choices: [
        "\\( \\begin{pmatrix} 3 & -1 \\\\ -5 & 2 \\end{pmatrix} \\)",
        "\\( \\begin{pmatrix} -3 & 1 \\\\ 5 & -2 \\end{pmatrix} \\)",
        "\\( \\begin{pmatrix} 2 & -1 \\\\ -5 & 3 \\end{pmatrix} \\)",
        "\\( \\begin{pmatrix} 3 & 5 \\\\ 1 & 2 \\end{pmatrix} \\)"
      ],
      correctIndex: 0,
      solution: "For a \\( 2 \\times 2 \\) matrix \\( \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\), the inverse is \\( \\frac{1}{ad - bc} \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix} \\). Here, \\( \\det(A) = (2)(3) - (1)(5) = 6 - 5 = 1 \\). Swapping diagonal elements and negating off-diagonals produces \\( \\begin{pmatrix} 3 & -1 \\\\ -5 & 2 \\end{pmatrix} \\).",
      difficulty: "hard",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-006",
      prompt: "Find the equation of the tangent line to the curve \\( y = x^2 - 4x + 5 \\) at the coordinate point \\( (3, 2) \\).",
      choices: ["\\( y = 2x - 4 \\)", "\\( y = 2x + 2 \\)", "\\( y = -2x + 8 \\)", "\\( y = x - 1 \\)"],
      correctIndex: 0,
      solution: "Compute the derivative for slope: \\( y' = 2x - 4 \\). At \\( x = 3 \\), \\( m = 2(3) - 4 = 2 \\). Using point-slope form with \\( (3, 2) \\): \\( y - 2 = 2(x - 3) \\implies y = 2x - 6 + 2 \\implies y = 2x - 4 \\).",
      difficulty: "easy",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-007",
      prompt: "In a geometric progression where the first term \\( a_1 = 3 \\) and common ratio \\( r = 2 \\), what is the sum of the first 6 terms \\( S_6 \\)?",
      choices: ["189", "192", "93", "381"],
      correctIndex: 0,
      solution: "The sum formula for a finite geometric series is \\( S_n = \\frac{a(r^n - 1)}{r - 1} \\). For \\( n = 6 \\), \\( S_6 = \\frac{3(2^6 - 1)}{2 - 1} = 3(64 - 1) = 3(63) = 189 \\).",
      difficulty: "easy",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
    {
      id: "euee-math-008",
      prompt: "Evaluate the limit \\( \\lim_{x \\to \\infty} \\frac{4x^3 - 5x + 7}{2x^3 + 9x^2 - 1} \\).",
      choices: ["2", "4", "0", "\\( \\infty \\)"],
      correctIndex: 0,
      solution: "Divide numerator and denominator by the highest power of \\( x \\) in the denominator (\\( x^3 \\)): \\( \\lim_{x \\to \\infty} \\frac{4 - 5/x^2 + 7/x^3}{2 + 9/x - 1/x^3} = \\frac{4 - 0 + 0}{2 + 0 - 0} = \\frac{4}{2} = 2 \\).",
      difficulty: "easy",
      subject: "Mathematics",
      examTitle: "National Entrance Model Exam: Advanced Calculus",
      packageId: "grade-12",
    },
  ],

  "model-physics": [
    {
      id: "phys-001",
      prompt: "A projectile is launched from flat ground with initial speed \\( v_0 = 20 \\, \\text{m/s} \\) at an elevation angle of \\( 30^\\circ \\). Taking \\( g = 10 \\, \\text{m/s}^2 \\), what is its maximum height above the launch level?",
      choices: ["5 m", "10 m", "15 m", "20 m"],
      correctIndex: 0,
      solution: "Vertical component of initial velocity is \\( v_{0y} = v_0 \\sin(30^\\circ) = 20 \\times 0.5 = 10 \\, \\text{m/s} \\). Maximum height is achieved when \\( v_y = 0 \\): \\( H_{\\max} = \\frac{v_{0y}^2}{2g} = \\frac{10^2}{2(10)} = \\frac{100}{20} = 5 \\, \\text{m} \\).",
      difficulty: "medium",
      subject: "Physics",
      examTitle: "University Entrance Model Exam: Classical Mechanics & Thermodynamics",
      packageId: "grade-12",
    },
    {
      id: "phys-002",
      prompt: "A block of mass \\( m = 4 \\, \\text{kg} \\) is pushed horizontally across a floor with kinetic friction coefficient \\( \\mu_k = 0.25 \\). If a horizontal pulling force of \\( 30 \\, \\text{N} \\) is applied (\\( g = 10 \\, \\text{m/s}^2 \\)), what is the acceleration of the block?",
      choices: ["\\( 5.0 \\, \\text{m/s}^2 \\)", "\\( 7.5 \\, \\text{m/s}^2 \\)", "\\( 2.5 \\, \\text{m/s}^2 \\)", "\\( 10 \\, \\text{m/s}^2 \\)"],
      correctIndex: 0,
      solution: "Normal force on level ground is \\( N = mg = 4 \\times 10 = 40 \\, \\text{N} \\). Frictional force is \\( f_k = \\mu_k N = 0.25 \\times 40 = 10 \\, \\text{N} \\). Net force \\( F_{\\text{net}} = F_{\\text{applied}} - f_k = 30 - 10 = 20 \\, \\text{N} \\). Using Newton's 2nd Law: \\( a = \\frac{F_{\\text{net}}}{m} = \\frac{20}{4} = 5.0 \\, \\text{m/s}^2 \\).",
      difficulty: "medium",
      subject: "Physics",
      examTitle: "University Entrance Model Exam: Classical Mechanics & Thermodynamics",
      packageId: "grade-12",
    },
    {
      id: "phys-003",
      prompt: "According to the First Law of Thermodynamics, if \\( 500 \\, \\text{J} \\) of heat is added to a closed system while the system performs \\( 200 \\, \\text{J} \\) of work on its surroundings, what is the change in internal energy \\( \\Delta U \\)?",
      choices: ["\\( +300 \\, \\text{J} \\)", "\\( +700 \\, \\text{J} \\)", "\\( -300 \\, \\text{J} \\)", "\\( +2.5 \\, \\text{J} \\)"],
      correctIndex: 0,
      solution: "By the First Law of Thermodynamics: \\( \\Delta U = Q - W \\). Here heat absorbed \\( Q = +500 \\, \\text{J} \\) and work performed by system \\( W = +200 \\, \\text{J} \\). Thus, \\( \\Delta U = 500 - 200 = +300 \\, \\text{J} \\).",
      difficulty: "easy",
      subject: "Physics",
      examTitle: "University Entrance Model Exam: Classical Mechanics & Thermodynamics",
      packageId: "grade-12",
    },
    {
      id: "phys-004",
      prompt: "Two point charges \\( q_1 = +2 \\, \\mu\\text{C} \\) and \\( q_2 = +8 \\, \\mu\\text{C} \\) are placed \\( 0.2 \\, \\text{m} \\) apart in vacuum. Using \\( k = 9 \\times 10^9 \\, \\text{N}\\cdot\\text{m}^2/\\text{C}^2 \\), what electrostatic repulsive force acts between them?",
      choices: ["\\( 3.6 \\, \\text{N} \\)", "\\( 36 \\, \\text{N} \\)", "\\( 0.72 \\, \\text{N} \\)", "\\( 7.2 \\, \\text{N} \\)"],
      correctIndex: 0,
      solution: "Coulomb's Law: \\( F = \\frac{k |q_1 q_2|}{r^2} \\). Converting microcoulombs: \\( q_1 q_2 = (2 \\times 10^{-6})(8 \\times 10^{-6}) = 16 \\times 10^{-12} \\, \\text{C}^2 \\). Then \\( F = \\frac{9 \\times 10^9 \\times 16 \\times 10^{-12}}{(0.2)^2} = \\frac{144 \\times 10^{-3}}{0.04} = 3.6 \\, \\text{N} \\).",
      difficulty: "hard",
      subject: "Physics",
      examTitle: "University Entrance Model Exam: Classical Mechanics & Thermodynamics",
      packageId: "grade-12",
    },
    {
      id: "phys-005",
      prompt: "What is the equivalent resistance of three resistors of \\( 6\\,\\Omega \\), \\( 3\\,\\Omega \\), and \\( 2\\,\\Omega \\) connected in parallel?",
      choices: ["\\( 1\\,\\Omega \\)", "\\( 11\\,\\Omega \\)", "\\( 2\\,\\Omega \\)", "\\( 0.5\\,\\Omega \\)"],
      correctIndex: 0,
      solution: "For parallel resistors: \\( \\frac{1}{R_{\\text{eq}}} = \\frac{1}{6} + \\frac{1}{3} + \\frac{1}{2} = \\frac{1 + 2 + 3}{6} = \\frac{6}{6} = 1 \\implies R_{\\text{eq}} = 1\\,\\Omega \\).",
      difficulty: "easy",
      subject: "Physics",
      examTitle: "University Entrance Model Exam: Classical Mechanics & Thermodynamics",
      packageId: "grade-12",
    },
    {
      id: "phys-006",
      prompt: "A wave on a taut string has a frequency of \\( 50 \\, \\text{Hz} \\) and a wavelength of \\( 0.6 \\, \\text{m} \\). What is the propagation speed of the wave?",
      choices: ["\\( 30 \\, \\text{m/s} \\)", "\\( 83.3 \\, \\text{m/s} \\)", "\\( 50.6 \\, \\text{m/s} \\)", "\\( 15 \\, \\text{m/s} \\)"],
      correctIndex: 0,
      solution: "The wave speed formula is \\( v = f \\cdot \\lambda \\). Substituting gives \\( v = 50 \\times 0.6 = 30 \\, \\text{m/s} \\).",
      difficulty: "easy",
      subject: "Physics",
      examTitle: "University Entrance Model Exam: Classical Mechanics & Thermodynamics",
      packageId: "grade-12",
    },
  ],

  "exit-exam-engineering": [
    {
      id: "exit-eng-001",
      prompt: "In digital signal processing, according to the Nyquist-Shannon Sampling Theorem, what is the minimum sampling frequency required to completely reconstruct a bandlimited signal with highest spectral frequency \\( f_{\\max} = 4 \\, \\text{kHz} \\)?",
      choices: ["8 kHz", "4 kHz", "16 kHz", "2 kHz"],
      correctIndex: 0,
      solution: "The Nyquist criterion states that the sampling rate \\( f_s \\) must be at least twice the maximum frequency present in the continuous signal: \\( f_s \\ge 2 f_{\\max} = 2 \\times 4 \\, \\text{kHz} = 8 \\, \\text{kHz} \\) to prevent spectral aliasing.",
      difficulty: "medium",
      subject: "Engineering",
      examTitle: "National University Exit Exam: Electrical & Computer Systems",
      packageId: "ece-y3-sem-1",
    },
    {
      id: "exit-eng-002",
      prompt: "In microprocessor architecture, which register holds the memory address of the next instruction to be fetched and executed?",
      choices: ["Program Counter (PC)", "Instruction Register (IR)", "Memory Data Register (MDR)", "Accumulator (ACC)"],
      correctIndex: 0,
      solution: "The Program Counter (PC) stores the memory location of the next sequential instruction. The Instruction Register (IR) holds the currently executing opcode, while the Accumulator stores transient arithmetic operands.",
      difficulty: "easy",
      subject: "Engineering",
      examTitle: "National University Exit Exam: Electrical & Computer Systems",
      packageId: "ece-y3-sem-1",
    },
    {
      id: "exit-eng-003",
      prompt: "In boolean algebra, simplify the logical SOP expression: \\( F = A B + A \\bar{B} \\).",
      choices: ["\\( A \\)", "\\( B \\)", "\\( A + B \\)", "1"],
      correctIndex: 0,
      solution: "Factor out common term \\( A \\): \\( F = A(B + \\bar{B}) \\). By complementary law, \\( B + \\bar{B} = 1 \\). Therefore \\( F = A \\cdot 1 = A \\).",
      difficulty: "easy",
      subject: "Engineering",
      examTitle: "National University Exit Exam: Electrical & Computer Systems",
      packageId: "ece-y3-sem-1",
    },
    {
      id: "exit-eng-004",
      prompt: "For an operational amplifier circuit configured with negative feedback, what are the two core ideal op-amp golden rules?",
      choices: [
        "Infinite input impedance (zero input current) and virtual short between inputs",
        "Zero output impedance and infinite offset voltage",
        "Infinite output current and unity open-loop gain",
        "Finite input resistance and nonzero bias currents"
      ],
      correctIndex: 0,
      solution: "The golden rules of ideal op-amps operating linearly in closed loop are: (1) no current flows into either input terminal (\\( I_+ = I_- = 0 \\)), and (2) the differential voltage between the non-inverting and inverting pins is forced to zero (\\( V_+ = V_- \\), virtual short).",
      difficulty: "medium",
      subject: "Engineering",
      examTitle: "National University Exit Exam: Electrical & Computer Systems",
      packageId: "ece-y3-sem-1",
    },
    {
      id: "exit-eng-005",
      prompt: "In an AC circuit with an inductive reactance \\( X_L = 40\\,\\Omega \\) and pure resistance \\( R = 30\\,\\Omega \\) in series, what is the total circuit impedance \\( Z \\)?",
      choices: ["\\( 50\\,\\Omega \\)", "\\( 70\\,\\Omega \\)", "\\( 10\\,\\Omega \\)", "\\( 1200\\,\\Omega \\)"],
      correctIndex: 0,
      solution: "Impedance of a series RL circuit is given by \\( Z = \\sqrt{R^2 + X_L^2} = \\sqrt{30^2 + 40^2} = \\sqrt{900 + 1600} = \\sqrt{2500} = 50\\,\\Omega \\).",
      difficulty: "medium",
      subject: "Engineering",
      examTitle: "National University Exit Exam: Electrical & Computer Systems",
      packageId: "ece-y3-sem-1",
    },
    {
      id: "exit-eng-006",
      prompt: "What is the computational asymptotic time complexity of building a balanced binary search tree from a pre-sorted array of \\( n \\) elements?",
      choices: ["\\( O(n) \\)", "\\( O(n \\log n) \\)", "\\( O(n^2) \\)", "\\( O(1) \\)"],
      correctIndex: 0,
      solution: "Since the array is already sorted, a recursive divide-and-conquer algorithm picks the middle element as root and builds left and right subtrees. Each array element is visited once, yielding \\( T(n) = 2T(n/2) + O(1) \\implies O(n) \\).",
      difficulty: "hard",
      subject: "Engineering",
      examTitle: "National University Exit Exam: Electrical & Computer Systems",
      packageId: "ece-y3-sem-1",
    },
  ],

  "academic-defense-tutorial": [
    {
      id: "tut-001",
      prompt: "Which core law of motion establishes that the acceleration of an object is directly proportional to net force and inversely proportional to mass (\\( F = ma \\))?",
      choices: [
        "Newton's Second Law of Motion",
        "Newton's First Law of Motion (Inertia)",
        "Newton's Third Law (Action-Reaction)",
        "Law of Universal Gravitation"
      ],
      correctIndex: 0,
      solution: "Newton's Second Law quantitatively defines how acceleration results from unbalanced forces: \\( \\Sigma \\mathbf{F} = m \\mathbf{a} \\).",
      difficulty: "easy",
      subject: "Tutorial Foundation",
      examTitle: "Defense Citadel Foundation Trial",
      packageId: "freshman",
    },
    {
      id: "tut-002",
      prompt: "In differential calculus, what is the derivative of \\( f(x) = \\ln(x) \\) with respect to \\( x \\) for \\( x > 0 \\)?",
      choices: ["\\( \\frac{1}{x} \\)", "\\( e^x \\)", "\\( x \\)", "\\( -\\frac{1}{x^2} \\)"],
      correctIndex: 0,
      solution: "By fundamental calculus rules, the rate of change of the natural logarithmic function is \\( \\frac{d}{dx} \\ln(x) = \\frac{1}{x} \\).",
      difficulty: "easy",
      subject: "Tutorial Foundation",
      examTitle: "Defense Citadel Foundation Trial",
      packageId: "freshman",
    },
    {
      id: "tut-003",
      prompt: "What is the pH value of a neutral pure aqueous solution at standard temperature \\( 25^\\circ\\text{C} \\)?",
      choices: ["7.0", "1.0", "14.0", "0.0"],
      correctIndex: 0,
      solution: "At \\( 25^\\circ\\text{C} \\), water auto-ionizes with \\( [\\text{H}^+] = [\\text{OH}^-] = 1.0 \\times 10^{-7} \\, \\text{M} \\). The \\( \\text{pH} = -\\log_{10}(10^{-7}) = 7.0 \\).",
      difficulty: "easy",
      subject: "Tutorial Foundation",
      examTitle: "Defense Citadel Foundation Trial",
      packageId: "freshman",
    },
    {
      id: "tut-004",
      prompt: "Identify the logical fallacy: 'Nobody has proven that extraterrestrial life does not exist, therefore alien civilizations must definitely exist.'",
      choices: [
        "Argument from Ignorance (Argumentum ad Ignorantiam)",
        "Ad Hominem Attack",
        "False Dichotomy",
        "Slippery Slope"
      ],
      correctIndex: 0,
      solution: "The argument from ignorance falsely asserts that a proposition is true simply because it has not yet been proven false (or vice-versa).",
      difficulty: "easy",
      subject: "Tutorial Foundation",
      examTitle: "Defense Citadel Foundation Trial",
      packageId: "freshman",
    },
  ],
};

/**
 * Loads all exam tracks available to the current student.
 * - Extracts dynamic exam resources from Supabase / offline cache (hub === "exams").
 * - Combines with curated official model exam tracks.
 * - Enforces package entitlements (unlocked for owned or free packages; locked otherwise).
 */
export async function getPlayableExamTowers(): Promise<TowerTrack[]> {
  const tracks: TowerTrack[] = [];

  // Check default curated towers
  const isGrade12Free = isFreeForRegistered("grade-12");
  const isEceFree = isFreeForRegistered("ece-y3-sem-1");
  const isFreshmanFree = isFreeForRegistered("freshman");

  const [hasGrade12, hasEce, hasFreshman] = await Promise.all([
    isPackageOwned("grade-12"),
    isPackageOwned("ece-y3-sem-1"),
    isPackageOwned("freshman"),
  ]);

  // 1. Tutorial Foundation Trial (Always free / demo)
  tracks.push({
    id: "tutorial-trial",
    title: "Citadel Foundation Trial",
    subtitle: "Introductory wave drill covering fundamental science & logic",
    subject: "Academic Essentials",
    badge: "Foundation",
    accentColor: "text-amber-400",
    packageId: "freshman",
    isLocked: false,
    questionCount: CURATED_EXAM_QUESTIONS["academic-defense-tutorial"].length,
    questions: CURATED_EXAM_QUESTIONS["academic-defense-tutorial"],
  });

  // 2. EUEE Advanced Mathematics Tower
  tracks.push({
    id: "euee-math",
    title: "EUEE Advanced Calculus & Matrix Citadel",
    subtitle: "Official national matriculation exam questions in calculus, vectors, & algebra",
    subject: "Mathematics",
    badge: "Matriculation Exam",
    accentColor: "text-cyan-400",
    packageId: "grade-12",
    isLocked: !(hasGrade12 || isGrade12Free),
    lockReason: "Requires Grade 12 Package entitlement",
    questionCount: CURATED_EXAM_QUESTIONS["euee-math"].length,
    questions: CURATED_EXAM_QUESTIONS["euee-math"],
  });

  // 3. Classical Mechanics & Thermodynamics Tower
  tracks.push({
    id: "model-physics",
    title: "Physics Mechanics & Fields Bastion",
    subtitle: "Calculated physics exam problems: kinetics, thermodynamics, and circuit laws",
    subject: "Physics",
    badge: "University Entrance",
    accentColor: "text-emerald-400",
    packageId: "grade-12",
    isLocked: !(hasGrade12 || isGrade12Free),
    lockReason: "Requires Grade 12 Package entitlement",
    questionCount: CURATED_EXAM_QUESTIONS["model-physics"].length,
    questions: CURATED_EXAM_QUESTIONS["model-physics"],
  });

  // 4. University Exit Exam Comprehensive Track
  tracks.push({
    id: "exit-exam-engineering",
    title: "University Exit Exam: Computer & Systems Citadel",
    subtitle: "Comprehensive graduation exit exam problems: DSP, architecture, and network logic",
    subject: "Engineering Systems",
    badge: "Exit Exam Model",
    accentColor: "text-fuchsia-400",
    packageId: "ece-y3-sem-1",
    isLocked: !(hasEce || isEceFree),
    lockReason: "Requires Senior Engineering Exit Exam package",
    questionCount: CURATED_EXAM_QUESTIONS["exit-exam-engineering"].length,
    questions: CURATED_EXAM_QUESTIONS["exit-exam-engineering"],
  });

  // 5. Dynamic integration: Inspect any live or cached exam resources from Supabase
  try {
    const liveExams = await listResources({
      hub: "exams",
      publishedOnly: true,
    });

    if (liveExams.items && liveExams.items.length > 0) {
      // List rows are light; only the checked door may provide answer keys and
      // question JSON to this dynamic exam integration.
      const checkedItems = await Promise.all(
        liveExams.items.map(async (candidate) => (await getResourceById(candidate.id)).item)
      );
      const accessibleItems = checkedItems.filter(
        (item): item is LearningResource => Boolean(item)
      );
      for (const res of accessibleItems) {
        const rawQuestions = Array.isArray(res.meta?.questions)
          ? (res.meta.questions as Record<string, unknown>[])
          : [];

        if (rawQuestions.length > 0) {
          const formattedQuestions: ExamQuestion[] = rawQuestions.map((q, idx) => ({
            id: `dyn-${res.id}-${idx}`,
            prompt: String(q.prompt || q.question || ""),
            choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
            correctIndex: Number(q.correctIndex ?? q.correct ?? 0),
            solution: q.solution ? String(q.solution) : undefined,
            difficulty: (q.difficulty as "easy" | "medium" | "hard") || "medium",
            subject: res.title,
            examTitle: res.title,
            packageId: res.packageId,
            scopePath: res.scopePath,
          }));

          const owned = await isPackageOwned(res.packageId);
          const free = isFreeForRegistered(res.packageId);

          tracks.push({
            id: `custom-exam-${res.id}`,
            title: res.title,
            subtitle: `Official exam from academy curriculum (${res.scopePath || "National Exam"})`,
            subject: res.title,
            badge: "Custom Exam Paper",
            accentColor: "text-teal-400",
            packageId: res.packageId,
            isLocked: !(owned || free),
            lockReason: `Requires package enrollment (${res.packageId})`,
            questionCount: formattedQuestions.length,
            questions: formattedQuestions,
          });
        }
      }
    }
  } catch {
    // Graceful offline fallback
  }

  return tracks;
}
