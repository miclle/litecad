import { describe, expect, test } from 'vitest'

import { parseOpenSCADParameters } from './openscad-parameters'

describe('OpenSCAD parameter parser', () => {
  test('parses top-level customizer assignments and groups', () => {
    expect(
      parseOpenSCADParameters(`
width = 50;        // [10:1:200]
style = "round";   // [round, square, hex]
enabled = true;
body_color = "SteelBlue";
/* [Mount] */
hole_diameter = 5; // [1:0.5:12]
module bracket() {
  cube([width, 10, 5]);
}
ignored_after_module = 100; // [0:1:200]
`),
    ).toEqual([
      { name: 'width', type: 'number', value: 50, range: { min: 10, step: 1, max: 200 }, group: '' },
      { name: 'style', type: 'string', value: 'round', options: ['round', 'square', 'hex'], group: '' },
      { name: 'enabled', type: 'boolean', value: true, group: '' },
      { name: 'body_color', type: 'color', value: 'SteelBlue', group: '' },
      { name: 'hole_diameter', type: 'number', value: 5, range: { min: 1, step: 0.5, max: 12 }, group: 'Mount' },
    ])
  })

  test('ignores non-parameter lines and multiline values', () => {
    expect(
      parseOpenSCADParameters(`
// no assignment here
points = [
  [0, 0],
  [1, 0]
];
name = "plate";
function helper() = 1;
after_function = 2;
`),
    ).toEqual([{ name: 'name', type: 'string', value: 'plate', group: '' }])
  })
})
