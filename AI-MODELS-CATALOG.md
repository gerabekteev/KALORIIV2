# 🤖 KaloriiAI — Полный каталог бесплатных AI моделей с Vision

> Актуальный на октябрь 2026. Все модели поддерживают ввод изображений (vision).

---

## 1. Gemini API (Google AI Studio) — Прямой доступ

> [!TIP]
> **Лучший бесплатный провайдер.** Не требует кредитной карты. Щедрые лимиты. Все модели ниже принимают изображения на вход.

| # | Модель | Model ID | Контекст | Описание | Рекомендация для KaloriiAI |
|---|---|---|---|---|---|
| ⭐1 | **Gemini 3.8 Flash** | `gemini-3.8-flash` | 1M токенов | Самый умный Flash. Лучший reasoning, агенты, сложные задачи | **🥇 Основная модель** — лучшее качество распознавания |
| ⭐2 | **Gemini 3.7 Flash** | `gemini-3.7-flash` | 1M токенов | Быстрый, надёжный. Хорош для coding + agentic tasks | **🥈 Первый fallback** |
| 3 | **Gemini 3.6 Flash** | `gemini-3.6-flash` | 1M токенов | Предыдущее поколение, стабильный мультимодальный | Резервный |
| 4 | **Gemini 3.5 Flash** | `gemini-3.5-flash` | 1M токенов | Ещё более ранний Flash, для рутинных задач | Резервный |
| 5 | **Gemini 3.5 Flash-Lite** | `gemini-3.5-flash-lite` | 1M токенов | Экономичный, для больших объёмов | Быстрый запасной |
| 6 | **Gemini 3.1 Flash-Lite** | `gemini-3.1-flash-lite` | 1M токенов | Экономичный, высокие объёмы | Запасной |
| 7 | **Gemini 3 Flash Preview** | `gemini-3-flash-preview` | — | Legacy Flash | Резерв на крайний случай |
| 8 | **Gemini 2.5 Pro** | `gemini-2.5-pro` | 1M токенов | Pro-модель с thinking. Отличный reasoning | Тяжёлая артиллерия (медленнее) |
| 9 | **Gemini 2.5 Flash** | `gemini-2.5-flash` | 1M токенов | Гибридный reasoning + thinking budgets | Хороший резерв |
| 10 | **Gemini 2.5 Flash-Lite** | `gemini-2.5-flash-lite` | 1M токенов | Маленький и эффективный | Резерв |
| 11 | **Gemini 2.0 Flash** | `gemini-2.0-flash` | 1M токенов | Предыдущее поколение, стабильный | Проверенный резерв |
| 12 | **Gemini 2.0 Flash-Lite** | `gemini-2.0-flash-lite` | 1M токенов | Лёгкий, быстрый | Последний резерв |

### Лимиты Free Tier (Gemini API)

Точные лимиты зависят от модели и видны в [AI Studio](https://aistudio.google.com/rate-limit). Ориентировочно:

| Модель | RPM (запросов/мин) | RPD (запросов/день) | TPM (токенов/мин) |
|---|---|---|---|
| 3.8 / 3.7 / 3.6 Flash | ~10-15 | ~500-1500 | ~250K-1M |
| 3.5 Flash / Flash-Lite | ~15-30 | ~1500 | ~1M |
| 2.5 Pro | ~5 | ~50-100 | ~250K |
| 2.5 Flash | ~15 | ~500-1500 | ~1M |
| 2.0 Flash | ~15 | ~1500 | ~1M |

> [!NOTE]
> На Free Tier данные **используются для улучшения продуктов Google**. Для 1-3 пользователей это несущественно.

---

## 2. OpenRouter — Бесплатные модели с Vision

> [!TIP]
> OpenRouter предоставляет единый API (совместимый с OpenAI) для множества моделей. Бесплатные модели маркируются суффиксом `:free`.

### Лимиты OpenRouter Free Tier
- **Стандартный аккаунт** (< \$10 депозита): ~20 RPM, ~50-200 RPD
- **Верифицированный** (≥ \$10 баланса): до 1000 RPD (баланс не списывается за free модели)

| # | Модель | Model ID | Провайдер | Контекст | Качество Vision |
|---|---|---|---|---|---|
| ⭐1 | **Qwen 2.5 VL 72B** | `qwen/qwen2.5-vl-72b-instruct:free` | Alibaba/Qwen | 128K | 🏆 **Лучшая open-weights VLM**. На уровне GPT-4o по OCR и таблицам |
| 2 | **Gemini 2.0 Pro Exp** | `google/gemini-2.0-pro-exp-02-05:free` | Google | 2M | Frontier reasoning, но строгие лимиты (~5-10 RPM) |
| 3 | **Gemini 2.0 Flash Exp** | `google/gemini-2.0-flash-exp:free` | Google | 1M | Быстрый + мультимодальный |
| 4 | **Gemini 2.0 Flash Thinking** | `google/gemini-2.0-flash-thinking-exp:free` | Google | 1M | Chain-of-thought visual reasoning |
| 5 | **Gemma 3 27B** | `google/gemma-3-27b-it:free` | Google | 128K | Сильная open-weights от Google |
| 6 | **Mistral Small 3.1 24B** | `mistralai/mistral-small-3.1-24b-instruct:free` | Mistral AI | 128K | Отличный OCR и документы |
| 7 | **Gemma 3 12B** | `google/gemma-3-12b-it:free` | Google | 128K | Сбалансированная, средний размер |
| 8 | **Llama 3.2 11B Vision** | `meta-llama/llama-3.2-11b-vision-instruct:free` | Meta | 128K | Надёжная рабочая лошадка |
| 9 | **Qwen 2.5 VL 7B** | `qwen/qwen2.5-vl-7b-instruct:free` | Alibaba/Qwen | 32-128K | Маленькая но точная, особенно OCR |
| 10 | **Gemma 3 4B** | `google/gemma-3-4b-it:free` | Google | 128K | Ультра-лёгкая, для базового распознавания |
| 🔄 | **Auto-Router** | `openrouter/free` | OpenRouter | До 200K | Автовыбор из доступных free моделей. При отправке фото выбирает только vision-модели |

---

## 3. Альтернативные бесплатные провайдеры

| Провайдер | Модели с Vision | Лимиты | Примечания |
|---|---|---|---|
| **GitHub Models** | GPT-4o, GPT-4o-mini, Llama 3.2 11B/90B Vision, Phi-3.5-vision | 15 RPM, 150 RPD | 🔥 **Бесплатный GPT-4o!** Нужен GitHub PAT токен. Azure-совместимый API |
| **Groq Cloud** | Qwen VL, Llama 3.2 Vision | 30 RPM, строгие TPM/TPD | Экстремально быстрый (300-600 tok/sec). Без кредитки |
| **Cloudflare Workers AI** | Llama 3.2 11B Vision, Qwen VL | 10K Neurons/день | Serverless edge. Фото быстро расходуют лимит |
| **Hugging Face Inference** | Qwen 2.5 VL 7B/3B, GLM-4.5V | Shared free credits | OpenAI-совместимый API. Возможны cold-starts |

---

## 4. Рекомендуемый дефолтный приоритет моделей для KaloriiAI

Порядок по умолчанию (пользователь может настроить в профиле):

```
Приоритет 1: gemini-3.5-flash-lite                     (Gemini API)    — 🥇 100% надёжность, субсекундный отклик
Приоритет 2: gemini-3.8-flash                          (Gemini API)    — 🥈 Лучший visual reasoning
Приоритет 3: gemini-3.7-flash                          (Gemini API)    — 🥉 Быстрый агентный fallback
Приоритет 4: google/gemma-4-26b-a4b-it:free            (OpenRouter)    — Сильная open-weights VLM
Приоритет 5: openrouter/free                           (OpenRouter)    — Авто-роутер vision моделей
```

### Логика retry и failover

```
Для каждой модели в списке приоритетов:
  ├── Попытка 1 → отправить запрос
  │   ├── Успех → вернуть результат ✅
  │   ├── Rate Limit (429) → немедленно перейти к следующей модели (без ожидания) ⚡
  │   └── Ошибка сервера (503/timeout) → подождать 5 сек
  │
  ├── Попытка 2 → повторить запрос
  │   ├── Успех → вернуть результат ✅
  │   └── Ошибка → перейти к следующей модели ⬇️
  │
  └── (переход к следующей модели)

Если ВСЕ модели исчерпаны → вернуть AllProvidersFailedError
                            → предложить пользователю ввести КБЖУ вручную
```

---

## 5. Настройка приоритета моделей в профиле пользователя

В разделе **Профиль → Настройки AI** пользователь сможет:

1. **Drag & drop** для изменения порядка моделей
2. **Включить/выключить** конкретные модели (чекбокс)
3. **Добавить свой API ключ** для провайдера (опционально)
4. **Видеть статус** каждой модели (✅ доступна / ⚠️ лимит / ❌ недоступна)

```
┌─────────────────────────────────────┐
│  ⚙️ Настройки AI моделей            │
├─────────────────────────────────────┤
│                                     │
│  Перетащите для изменения порядка:   │
│                                     │
│  ☑ ≡ 1. Gemini 3.8 Flash     ✅    │
│  ☑ ≡ 2. Gemini 3.7 Flash     ✅    │
│  ☑ ≡ 3. Qwen 2.5 VL 72B     ⚠️    │
│  ☑ ≡ 4. Gemini 2.5 Flash     ✅    │
│  ☑ ≡ 5. Gemini 3.5 Flash-Lite ✅   │
│  ☑ ≡ 6. OpenRouter Auto      ✅    │
│  ☐ ≡ 7. Llama 3.2 11B Vision ❌    │
│                                     │
│  ── API ключи ────────────────────  │
│  Gemini:     [AIza...****]  ✅     │
│  OpenRouter: [sk-or...****] ✅     │
│                                     │
│         [ Сохранить ]               │
└─────────────────────────────────────┘
```
