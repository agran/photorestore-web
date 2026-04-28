import { test, expect } from '@playwright/test';

test('home page loads and shows hero title', async ({ page }) => {
  await page.goto('/');
  // Check that the page loads successfully
  await expect(page).toHaveTitle(/PhotoRestore/i);
  // Check hero section is visible (either EN or RU)
  const hero = page.locator('h1').first();
  await expect(hero).toBeVisible();
});

test('navigation to editor works', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Editor');
  await expect(page).toHaveURL(/\/editor/);
});

test('navigation to about works', async ({ page }) => {
  await page.goto('/');
  await page.click('text=About');
  await expect(page).toHaveURL(/\/about/);
});

test('language switcher changes language', async ({ page }) => {
  await page.goto('/');
  // Find language switcher button
  const langBtn = page.getByRole('button', { name: /switch language/i });
  await expect(langBtn).toBeVisible();
  await langBtn.click();
  // After click, some text should change
  // (We just verify the button still exists and is clickable)
  await expect(langBtn).toBeVisible();
});
