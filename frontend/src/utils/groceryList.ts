export interface GroceryItem {
  id: string
  name: string
  totalGrams: number
  category: string
  checked: boolean
}

export type GroceryCategory =
  | '🥦 Овощи, фрукты и зелень'
  | '🥩 Мясо, птица, рыба'
  | '🥛 Молочные продукты и яйца'
  | '🌾 Бакалея и крупы'
  | '🛒 Другое'

const CATEGORY_KEYWORDS: Record<GroceryCategory, string[]> = {
  '🥦 Овощи, фрукты и зелень': [
    'огурец',
    'огурц',
    'помидор',
    'томат',
    'яблок',
    'банан',
    'апельсин',
    'мандарин',
    'зелень',
    'укроп',
    'петрушк',
    'салат',
    'шпинат',
    'капуст',
    'морков',
    'лук',
    'чеснок',
    'картофел',
    'перец',
    'ягод',
    'клубник',
    'малин',
    'черник',
    'авокадо',
    'гриб',
    'шампиньон',
    'лимон',
    'лайм',
    'кабачок',
    'баклажан',
    'брокколи',
    'тыкв',
    'груш',
    'персик',
  ],
  '🥩 Мясо, птица, рыба': [
    'куриц',
    'кур',
    'филе',
    'грудк',
    'говядин',
    'свинин',
    'фарш',
    'индейк',
    'мяс',
    'бекон',
    'колбас',
    'сосиск',
    'ветчин',
    'рыб',
    'лосось',
    'семг',
    'форел',
    'тунец',
    'минтай',
    'треск',
    'креветк',
    'кальмар',
    'морепродукт',
    'стейк',
    'котлет',
    'печень',
  ],
  '🥛 Молочные продукты и яйца': [
    'творог',
    'молок',
    'кефир',
    'сыр',
    'яйц',
    'яйцо',
    'сметан',
    'йогурт',
    'ряженк',
    'сливк',
    'протеин',
    'масло сливочн',
    'пармезан',
    'моцарелл',
  ],
  '🌾 Бакалея и крупы': [
    'гречк',
    'рис',
    'овсянк',
    'геркулес',
    'макарон',
    'спагетти',
    'паст',
    'мук',
    'хлеб',
    'лаваш',
    'батон',
    'хлопь',
    'мюсли',
    'масло растительн',
    'масло оливков',
    'масло подсолнечн',
    'орех',
    'арахис',
    'миндал',
    'кешью',
    'грецк',
    'фундук',
    'сахар',
    'соль',
    'специ',
    'мед',
    'мёд',
    'фасол',
    'чечевиц',
    'нут',
    'горох',
    'консерв',
  ],
  '🛒 Другое': [],
}

export function classifyGroceryItem(name: string): GroceryCategory {
  const lower = name.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
    GroceryCategory,
    string[],
  ][]) {
    if (category === '🛒 Другое') continue
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return category
      }
    }
  }
  return '🛒 Другое'
}

export function generateGroceryListFromItems(
  items: Array<{ name: string; weightGrams?: number; category?: string }>
): GroceryItem[] {
  const map = new Map<
    string,
    { name: string; totalGrams: number; category: string }
  >()

  items.forEach((item) => {
    const rawName = item.name.trim()
    if (!rawName) return

    // Clean up portion numbers in parentheses like "(100г)" from name if present
    const cleanName = rawName
      .replace(/\(\d+\s*г\)/gi, '')
      .replace(/,\s*\d+\s*г/gi, '')
      .trim()
    const normKey = cleanName.toLowerCase()
    const weight = item.weightGrams || 0
    const cat = item.category || classifyGroceryItem(cleanName)

    const existing = map.get(normKey)
    if (existing) {
      existing.totalGrams += weight
    } else {
      map.set(normKey, {
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        totalGrams: weight,
        category: cat,
      })
    }
  })

  return Array.from(map.entries()).map(([key, val]) => ({
    id: `grocery-${key}`,
    name: val.name,
    totalGrams: Math.round(val.totalGrams),
    category: val.category,
    checked: false,
  }))
}
