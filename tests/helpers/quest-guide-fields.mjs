// The quest definition's fields, as MAKING-QUESTS.md's field tables name them — derived from the real
// grammar specs (`QT` in js/quest-catalog.js), so the guide can be checked against the code.
//
// Paths are qualified so a repeated key (`id`, `kind`, `versionId`) can only match its own block:
//   $.…           the definition itself (QUEST_SCHEMA_V3)
//   phase.…       the fields every phase has (QUEST_PHASE_COMMON)
//   compose.… / transform.… / compare-offer.…   the fields only that phase type has
//   challenge.…   a compose or transform phase's challenge (QUEST_CHALLENGE)
//   procedure.…   a phase's procedure (QUEST_PROCEDURE)
//   setup.…       the `waypoints` setup rule (QUEST_SETUP_KINDS.waypoints.parameterSchema)
// `[]` is "each item of the list".

const range = (min, max) => (min === max ? `exactly ${min}` : `${min}–${max}`);

/** One spec, in the words the guide's "type" column uses. */
export function describeSpec(spec, named) {
  if (named && named.has(spec)) return named.get(spec);
  switch (spec.k) {
    case "lit": return spec.vals.map(v => JSON.stringify(v)).join(" or ");
    case "text": return `text, ${range(spec.min || 1, spec.max)} characters`;
    case "slug": return "slug";
    case "primitiveId": return "dotted id";
    case "int": return `whole number, ${range(spec.min, spec.max)}`;
    case "opaque": return "any JSON (see the section)";
    case "obj": return "object";
    case "arr": {
      const scalar = spec.of.k !== "obj" && spec.of.k !== "arr";
      return (scalar ? `list of ${describeSpec(spec.of, named)}` : "list") + `, ${range(spec.min, spec.max)}`
        + (spec.unique ? ", unique" : "");
    }
  }
  throw new Error("unknown spec kind " + spec.k);
}

function walk(spec, path, out, named, optional) {
  out.set(path, { type: describeSpec(spec, named), required: !optional });
  if (named && named.has(spec)) return;               // documented once, under its own root
  if (spec.k === "obj") {
    for (const key of Object.keys(spec.shape))
      walk(spec.shape[key], `${path}.${key}`, out, named, spec.optional.includes(key));
  } else if (spec.k === "arr" && (spec.of.k === "obj" || spec.of.k === "arr")) {
    walk(spec.of, `${path}[]`, out, named, false);
  }
}

/** Map of qualified path → { type, required }, for the newest schema version. */
export function questFields(g) {
  const out = new Map();
  const v = Math.max(...Object.keys(g.QUEST_SCHEMA_VALIDATORS).map(Number));
  const top = g["QUEST_SCHEMA_V" + v];
  if (!top) throw new Error("no QUEST_SCHEMA_V" + v);
  const named = new Map([[g.QUEST_CHALLENGE, "challenge"], [g.QUEST_PROCEDURE, "procedure"]]);
  for (const key of Object.keys(top.shape))
    walk(top.shape[key], "$." + key, out, named, top.optional.includes(key));
  // The witness songs and starter song are v3 songs, opaque to the grammar; the guide names them.
  const common = g.QUEST_PHASE_COMMON;
  // A common field is optional only if every phase type says so — read from the shapes, never assumed.
  const shapes = Object.values(g.QUEST_PHASE_SHAPES);
  for (const key of Object.keys(common))
    walk(common[key], "phase." + key, out, named, shapes.every(sh => sh.optional.includes(key)));
  for (const [type, shape] of Object.entries(g.QUEST_PHASE_SHAPES))
    for (const key of Object.keys(shape.shape))
      if (!(key in common)) walk(shape.shape[key], `${type}.${key}`, out, named, shape.optional.includes(key));
  for (const key of Object.keys(g.QUEST_CHALLENGE.shape))
    walk(g.QUEST_CHALLENGE.shape[key], "challenge." + key, out, named, g.QUEST_CHALLENGE.optional.includes(key));
  const proc = g.QUEST_PROCEDURE;
  for (const key of Object.keys(proc.shape)) walk(proc.shape[key], "procedure." + key, out, named, proc.optional.includes(key));
  const rule = g.QUEST_SETUP_KINDS.waypoints.parameterSchema;
  for (const key of Object.keys(rule.shape)) walk(rule.shape[key], "setup." + key, out, named, rule.optional.includes(key));
  return out;
}
