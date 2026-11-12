const r = (category, description, estimated, actual) => ({ category, description, estimated, actual });
export const SAMPLE_ITEMS = [
  r('Labour', 'Site engineers', 1800000, 1950000), r('Labour', 'Skilled workers', 1200000, 1180000), r('Labour', 'Project management', 600000, 610000),
  r('Materials', 'Cement and concrete', 2400000, 2650000), r('Materials', 'Steel reinforcement', 3100000, 4650000), r('Materials', 'Electrical fittings', 700000, 640000),
  r('Equipment', 'Crane rental', 900000, 1010000), r('Equipment', 'Excavator hire', 450000, 430000),
  r('Software', 'Licences', 350000, 340000), r('Software', 'Cloud hosting', 220000, 225000),
  r('Contingency', 'Unplanned site repairs', 0, 380000), r('Permits', 'Municipal approvals', 250000, 250000), r('Permits', 'Municipal approvals', 250000, 250000),
];
export const TEMPLATE_CSV = 'Category,Description,Estimated Cost,Actual Cost\nLabour,Site engineers,1800000,1950000\nMaterials,Cement and concrete,2400000,2650000\nEquipment,Crane rental,900000,1010000\n';

// Full demo project: cost items + EVM inputs (BAC follows total estimated cost, AC follows total actual cost).
export function sampleProject(today = new Date()) {
  const asOf = today.toISOString().slice(0, 10);
  return {
    version: 2, name: 'Lahore Office Block (Sample)', threshold: 10,
    items: SAMPLE_ITEMS.map((i, k) => ({ id: `sample-${k}`, ...i })),
    evm: { bacMode: 'linked', bac: null, start: '2026-03-01', end: '2027-01-31', asOf, pv: 10400000, ev: 9800000, acMode: 'linked', ac: null,
      history: [{ date: '2026-07-31', pv: 4100000, ev: 3600000, ac: 5200000 }, { date: '2026-09-30', pv: 7600000, ev: 6900000, ac: 9800000 }] },
  };
}
