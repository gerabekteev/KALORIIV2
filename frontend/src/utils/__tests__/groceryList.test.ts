import { describe, it, expect } from 'vitest'
import { classifyGroceryItem, generateGroceryListFromItems } from '../groceryList'

describe('groceryList utility', () => {
  describe('classifyGroceryItem', () => {
    it('classifies vegetables and fruits correctly', () => {
      expect(classifyGroceryItem('Свежие огурцы')).toBe('Овощи, фрукты и зелень')
      expect(classifyGroceryItem('Томаты черри')).toBe('Овощи, фрукты и зелень')
      expect(classifyGroceryItem('Спелое яблоко Голден')).toBe('Овощи, фрукты и зелень')
      expect(classifyGroceryItem('Бананы')).toBe('Овощи, фрукты и зелень')
      expect(classifyGroceryItem('Укроп и петрушка')).toBe('Овощи, фрукты и зелень')
      expect(classifyGroceryItem('Авокадо хасс')).toBe('Овощи, фрукты и зелень')
    })

    it('classifies meat, poultry, and fish correctly', () => {
      expect(classifyGroceryItem('Куриное филе грудки')).toBe('Мясо, птица, рыба')
      expect(classifyGroceryItem('Говядина мякоть')).toBe('Мясо, птица, рыба')
      expect(classifyGroceryItem('Фарш индейки')).toBe('Мясо, птица, рыба')
      expect(classifyGroceryItem('Стейк лосося')).toBe('Мясо, птица, рыба')
      expect(classifyGroceryItem('Тунец консервированный')).toBe('Мясо, птица, рыба')
      expect(classifyGroceryItem('Креветки очищенные')).toBe('Мясо, птица, рыба')
    })

    it('classifies dairy and eggs correctly', () => {
      expect(classifyGroceryItem('Творог 5%')).toBe('Молочные продукты и яйца')
      expect(classifyGroceryItem('Молоко пастеризованное 2.5%')).toBe('Молочные продукты и яйца')
      expect(classifyGroceryItem('Сыр Российский')).toBe('Молочные продукты и яйца')
      expect(classifyGroceryItem('Кефир 1%')).toBe('Молочные продукты и яйца')
      expect(classifyGroceryItem('Яйца куриные С0')).toBe('Молочные продукты и яйца')
      expect(classifyGroceryItem('Йогурт греческий натуральный')).toBe('Молочные продукты и яйца')
    })

    it('classifies grains, groceries, and bakery correctly', () => {
      expect(classifyGroceryItem('Крупа гречневая')).toBe('Бакалея и крупы')
      expect(classifyGroceryItem('Овсяные хлопья длительной варки')).toBe('Бакалея и крупы')
      expect(classifyGroceryItem('Рис басмати')).toBe('Бакалея и крупы')
      expect(classifyGroceryItem('Макароны из твердых сортов пшеницы')).toBe('Бакалея и крупы')
      expect(classifyGroceryItem('Хлеб цельнозерновой')).toBe('Бакалея и крупы')
      expect(classifyGroceryItem('Оливковое масло Extra Virgin')).toBe('Бакалея и крупы')
    })

    it('falls back to "Другое" for uncategorized products', () => {
      expect(classifyGroceryItem('Зубная паста')).toBe('Другое')
      expect(classifyGroceryItem('Витаминный комплекс')).toBe('Другое')
    })
  })

  describe('generateGroceryListFromItems', () => {
    it('groups and sums weights for duplicate items correctly', () => {
      const items = [
        { name: 'Куриное филе', weightGrams: 200 },
        { name: 'Овсяные хлопья', weightGrams: 60 },
        { name: 'куриное филе (150 г)', weightGrams: 150 },
        { name: 'Яблоко', weightGrams: 180 },
        { name: 'Овсяные хлопья, 40 г', weightGrams: 40 },
      ]

      const list = generateGroceryListFromItems(items)

      // Total items should be deduplicated to 3: Chicken, Oatmeal, Apple
      expect(list).toHaveLength(3)

      const chicken = list.find((i) => i.name.toLowerCase().includes('куриное филе'))
      expect(chicken).toBeDefined()
      expect(chicken?.totalGrams).toBe(350)
      expect(chicken?.category).toBe('Мясо, птица, рыба')
      expect(chicken?.checked).toBe(false)

      const oatmeal = list.find((i) => i.name.toLowerCase().includes('овсяные хлопья'))
      expect(oatmeal).toBeDefined()
      expect(oatmeal?.totalGrams).toBe(100)
      expect(oatmeal?.category).toBe('Бакалея и крупы')

      const apple = list.find((i) => i.name.toLowerCase().includes('яблоко'))
      expect(apple).toBeDefined()
      expect(apple?.totalGrams).toBe(180)
      expect(apple?.category).toBe('Овощи, фрукты и зелень')
    })

    it('ignores empty items and handles missing weights gracefully', () => {
      const items = [
        { name: '', weightGrams: 100 },
        { name: '   ' },
        { name: 'Кофе молотый' },
      ]

      const list = generateGroceryListFromItems(items)
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('Кофе молотый')
      expect(list[0].totalGrams).toBe(0)
    })
  })
})
