import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for the app to be ready
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Dashboard loads without errors', async ({ page }) => {
    await expect(page).toHaveTitle(/JobCost/i);
    await expect(page.locator('h1')).toContainText('Dashboard');

    // No runtime error overlay should be visible
    await expect(page.locator('[data-error-overlay]')).not.toBeVisible();
  });

  test('Projects page loads', async ({ page }) => {
    await page.click('text=Projects');
    await expect(page.locator('h1')).toContainText('Projects');
  });

  test('Payroll page loads without errors', async ({ page }) => {
    await page.click('text=Payroll');
    await expect(page.locator('h1')).toContainText('Payroll');

    // BUG-001 regression: Should not show runtime error
    await expect(page.locator('text=Cannot read properties')).not.toBeVisible();
  });

  test('Settings page loads', async ({ page }) => {
    await page.click('text=Settings');
    await expect(page.locator('h1')).toContainText('Settings');
  });

  test('Navigation works between all pages', async ({ page }) => {
    const navItems = ['Dashboard', 'Projects', 'Payroll', 'Reports', 'Upload', 'Settings'];

    for (const item of navItems) {
      await page.click(`text=${item}`);
      // Just verify navigation doesn't crash
      await page.waitForLoadState('networkidle');
    }
  });
});

test.describe('Project CRM', () => {
  test('Project CRM loads with all tabs', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Click on first project (if exists)
    const projectCard = page.locator('[data-testid^="card-project-"]').first();

    if (await projectCard.count() > 0) {
      await projectCard.click();
      await page.waitForLoadState('networkidle');

      // Verify tabs exist
      await expect(page.locator('text=Overview')).toBeVisible();
      await expect(page.locator('text=Invoices')).toBeVisible();
      await expect(page.locator('text=Change Orders')).toBeVisible();
      await expect(page.locator('text=Payroll')).toBeVisible();
      await expect(page.locator('text=Materials')).toBeVisible();

      // Click through tabs
      await page.click('text=Invoices');
      await page.click('text=Change Orders');
      await page.click('text=Payroll');
      await page.click('text=Materials');
      await page.click('text=Overview');
    }
  });
});

test.describe('Payroll Import Flow', () => {
  test('Import Excel button is visible', async ({ page }) => {
    await page.goto('/payroll');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Import Excel')).toBeVisible();
  });
});
