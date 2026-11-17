// Helpers shared by the steel calc files. Pure.
// Fy and Fu from the chosen grade, or the typed values for a custom grade.
export function gradeOf(input, ed) {
  const g = ed.steel.grades.find((x) => x.value === input.grade);
  return g ? { Fy: g.Fy, Fu: g.Fu, label: g.label } : { Fy: input.Fy, Fu: input.Fu, label: 'Custom grade' };
}
// Available strength by method from a nominal strength and a {phi, omega} pair.
export function available(Rn, pair, method) { return method === 'ASD' ? Rn / pair.omega : pair.phi * Rn; }
export const factorText = (pair, method) => (method === 'ASD' ? 'Rn / Ω, Ω = ' + pair.omega : 'φRn, φ = ' + pair.phi);
