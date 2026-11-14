# Scope — the contract in numbers

What "the game is done" means for this project. The scale is agreed in phase 1,
the numbers are refined in phase 8. Lines are never deleted — they are ticked or marked
`BLOCKED: <why>`. Counted by `scope.py`.

Line syntax:

    - [ ] <name>: <N> <unit> — count: <command that prints a number>

## Reference inventory
жанр: десятки локаций и сотни предметов; мы идём этапами A→D

## Contract
- [ ] комнаты дома: 4 шт — count: grep -c "^  [a-z]*: \[$" src/content/furniture.ts
- [ ] предметы: 40 шт — count: grep -c "^  d('" src/content/items.ts
- [ ] комплекты одежды: 12 шт — count: grep -c "{ id: '[a-z]*', outfit" src/content/wardrobe.ts
- [ ] рецепты: 8 шт — count: grep -c "workspace: '" src/content/items.ts
- [ ] подарочные наборы: 4 шт — count: grep -c "paper: [0-9], bow" src/content/items.ts
