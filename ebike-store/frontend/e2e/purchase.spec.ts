// BROWSER end-to-end test (Playwright). NOT RUN in the build sandbox (no browser could be installed there):
// run it on your computer. Setup (once):   cd frontend && npm i -D @playwright/test && npx playwright install chromium
// Needs: PostgreSQL + backend (port 8000) + frontend (port 5173) running, demo data seeded (python -m app.seed), PAYMENT_MODE=test.
// Run:   npx playwright test e2e/purchase.spec.ts
import { expect, test } from '@playwright/test'

test('a customer buys a bike in test mode', async ({ page }) => {
  await page.goto('/shop')
  await expect(page.getByRole('heading', { name: /shop electric bikes/i })).toBeVisible()

  await page.getByRole('button', { name: /^add volt trail x1 to cart$/i }).click()
  await page.getByRole('link', { name: /cart, 1 item/i }).click()
  await expect(page.getByRole('heading', { name: 'Volt Trail X1' })).toBeVisible()
  await page.getByRole('link', { name: /proceed to checkout/i }).click()

  await expect(page.getByText(/test mode/i)).toBeVisible()
  await page.getByRole('button', { name: /place order/i }).click()          // empty form: validation, nothing sent
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()

  await page.getByLabel(/^email/i).fill(`e2e-${Date.now()}@example.com`)
  await page.getByLabel(/^full name/i).fill('E2E Buyer')
  await page.getByLabel(/^phone/i).fill('+237 600 111 222')
  await page.getByLabel(/^street address/i).fill('1 Test Street')
  await page.getByLabel(/^city/i).fill('Yaoundé')
  await page.getByLabel(/^region/i).fill('Centre')
  await page.getByRole('button', { name: /place order/i }).click()

  await expect(page.getByText(/simulated payment page/i)).toBeVisible()
  await page.getByRole('button', { name: /simulate successful payment/i }).click()
  await expect(page.getByText(/payment verified/i)).toBeVisible()
})
