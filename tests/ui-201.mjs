import endfield from './ui-endfield.mjs';
import completions from './ui-completions.mjs';
export default async function (helpers) {
  await endfield(helpers);
  await completions(helpers);
}
