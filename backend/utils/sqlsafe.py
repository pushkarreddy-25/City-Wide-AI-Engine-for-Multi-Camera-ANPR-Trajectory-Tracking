"""Query-safety helpers shared by the data layer and the security layer.

This lives in ``utils`` rather than in either caller because both need it:
:mod:`db.repository` builds the ``LIKE`` clause, and :mod:`api.security` exposes
the same helper as part of the documented security surface. Two copies of an
escaping routine is how one of them quietly stops matching the other.
"""


def like_escape(term: str) -> str:
    """Neutralise ``LIKE`` metacharacters in a user-supplied search term.

    ``%`` and ``_`` are wildcards, so an unescaped ``%`` silently turns a plate
    search into "match every row" — cheap for the caller, a full table scan for
    us. The backslash must be doubled *first*, otherwise the escapes added below
    would themselves be escaped.

    Pair it with ``escape="\\\\"`` on the clause, e.g.::

        column.like(f"%{like_escape(term)}%", escape="\\\\")

    without which SQLite treats the backslashes as literal characters to match.
    """
    return (term.replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_"))
