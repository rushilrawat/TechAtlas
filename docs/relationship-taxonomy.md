# Relationship taxonomy

Edges are typed and carry meaning (spec §3.3). Some are directed; some are symmetric.
The validator (`scripts/validate_dataset.py`) enforces the directionality and the
allowed source/target node types below.

| relationship_type     | directed? | typical source → target            | meaning |
|-----------------------|-----------|------------------------------------|---------|
| `belongs_to_domain`   | directed  | technology/concept → domain        | entity primarily lives in this domain |
| `has_subdomain`       | directed  | domain → domain                    | parent domain contains a child domain |
| `related_to`          | symmetric | any → any                          | general semantic relatedness |
| `implements`          | directed  | technology → concept               | tech is a concrete implementation of a concept |
| `used_for`            | directed  | technology → concept               | tech is commonly used to do this |
| `written_in`          | directed  | technology → technology(language)  | tech is implemented in this language |
| `built_on`            | directed  | technology → technology            | tech is built on top of another |
| `depends_on`          | directed  | technology → technology            | hard dependency/foundation |
| `integrates_with`     | symmetric | technology ↔ technology            | they interoperate |
| `alternative_to`      | symmetric | technology ↔ technology            | comparable options for the same job |
| `commonly_used_with`  | symmetric | technology ↔ technology            | frequently combined in real stacks |
| `supports`            | directed  | technology → concept               | tech provides support for a capability |
| `part_of_ecosystem`   | directed  | technology → technology/domain     | member of a larger ecosystem |
| `enables`             | directed  | concept/technology → concept       | makes another capability possible |

## Rules enforced by the validator

1. Every `source` and `target` must reference an existing node `id`.
2. No self-edges (a node cannot relate to itself) except a domain's own
   `belongs_to_domain` self-reference is **not** stored as an edge — primary domain is a
   node field.
3. No duplicate edges (same source, target, and type).
4. For symmetric types, a reverse duplicate (target→source same type) is treated as a
   duplicate and rejected; the graph stores one direction and the API treats it as
   undirected.
5. `written_in` targets must be a technology with subtype `programming_language`.
6. `has_subdomain` requires both endpoints to be `domain` nodes.
7. Inferred edges (`is_curated: false`) are allowed in the dataset but flagged in the
   validation report so they are never silently treated as verified.
