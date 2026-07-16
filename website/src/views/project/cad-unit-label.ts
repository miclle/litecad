export function cadUnitLabel(unit: string | undefined) {
  const normalizedUnit = unit?.trim().toLowerCase()
  if (normalizedUnit === 'millimetre' || normalizedUnit === 'millimeter' || normalizedUnit === 'millimeters' || normalizedUnit === 'millimetres') {
    return 'mm'
  }
  if (normalizedUnit === 'centimetre' || normalizedUnit === 'centimeter' || normalizedUnit === 'centimeters' || normalizedUnit === 'centimetres') {
    return 'cm'
  }
  if (normalizedUnit === 'metre' || normalizedUnit === 'meter' || normalizedUnit === 'meters' || normalizedUnit === 'metres') {
    return 'm'
  }
  if (normalizedUnit === 'inch' || normalizedUnit === 'inches') {
    return 'in'
  }
  return unit || 'unit'
}
