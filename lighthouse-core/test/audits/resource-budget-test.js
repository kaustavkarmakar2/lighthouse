/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const ResourceBudgetAudit = require('../../audits/resource-budget.js');
const networkRecordsToDevtoolsLog = require('../network-records-to-devtools-log.js');

/* eslint-env jest */

describe('Performance: Resource budgets audit', () => {
  let artifacts;
  let context;
  beforeEach(() => {
    artifacts = {
      devtoolsLogs: {
        defaultPass: networkRecordsToDevtoolsLog([
          {url: 'http://example.com/file.html', resourceType: 'Document', transferSize: 30},
          {url: 'http://example.com/app.js', resourceType: 'Script', transferSize: 10},
          {url: 'http://third-party.com/script.js', resourceType: 'Script', transferSize: 50},
          {url: 'http://third-party.com/file.jpg', resourceType: 'Image', transferSize: 70},
        ]),
      },
      URL: {requestedURL: 'http://example.com', finalURL: 'http://example.com'},
    };
    context = {computedCache: new Map(), settings: {}};
  });

  describe('with a budget.json', () => {
    beforeEach(() => {
      context.settings.budgets = [{
        path: '/',
        resourceSizes: [
          {
            resourceType: 'script',
            budget: 0,
          },
          {
            resourceType: 'image',
            budget: 1000,
          },
        ],
        resourceCounts: [
          {
            resourceType: 'script',
            budget: 0,
          },
          {
            resourceType: 'image',
            budget: 1000,
          },
        ],
      }];
    });

    it('includes table columns for requet & file size overages', async () => {
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      expect(result.details.headings).toHaveLength(5);
    });

    it('table item information is correct', async () => {
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      const item = result.details.items[0];
      expect(item.label).toBeDisplayString('Script');
      expect(item.requestCount).toBe(2);
      expect(item.size).toBe(60);
      expect(item.sizeOverBudget).toBe(60);
      expect(item.countOverBudget).toBeDisplayString('2 requests');
    });

    describe('request & transfer size overage', () => {
      it('are displayed', async () => {
        const result = await ResourceBudgetAudit.audit(artifacts, context);
        const scriptRow = result.details.items.find(r => r.resourceType === 'script');
        expect(scriptRow.sizeOverBudget).toBe(60);
        expect(scriptRow.countOverBudget).toBeDisplayString('2 requests');
      });

      it('are empty for passing budgets', async () => {
        const result = await ResourceBudgetAudit.audit(artifacts, context);
        const imageRow = result.details.items.find(r => r.resourceType === 'image');
        expect(imageRow.sizeOverBudget).toBeUndefined();
        expect(imageRow.countOverBudget).toBeUndefined();
      });

      it('convert budgets from kilobytes to bytes during calculations', async () => {
        context.settings.budgets = [{
          path: '/',
          resourceSizes: [
            {
              resourceType: 'document',
              budget: 20,
            },
          ],
        }];
        const result = await ResourceBudgetAudit.audit(artifacts, context);
        expect(result.details.items[0].siveOverBudget).toBeUndefined();
      });
    });

    it('only includes rows for resource types with budgets', async () => {
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      expect(result.details.items).toHaveLength(2);
    });

    it('sorts rows by descending file size overage', async () => {
      context.settings.budgets = [{
        path: '/',
        resourceSizes: [
          {
            resourceType: 'document',
            budget: 0,
          },
          {
            resourceType: 'script',
            budget: 0,
          },
          {
            resourceType: 'image',
            budget: 0,
          },
        ],
      }];
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      const items = result.details.items;
      items.slice(0, -2).forEach((item, index) => {
        expect(item.size).toBeGreaterThanOrEqual(items[index + 1].size);
      });
    });

    it('uses the first budget in budgets', async () => {
      context.settings.budgets = [{
        path: '/',
        resourceSizes: [
          {
            resourceType: 'image',
            budget: 0,
          },
        ],
      },
      {
        path: '/',
        resourceSizes: [
          {
            resourceType: 'script',
            budget: 0,
          },
        ],
      },
      ];
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      expect(result.details.items[0].resourceType).toBe('image');
    });
  });

  describe('without a budget.json', () => {
    beforeEach(() => {
      context.settings.budgets = null;
    });

    it('table only includes resourceType, requests, and file size', async () => {
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      expect(result.details.headings).toHaveLength(3);
    });

    it('table item information is correct', async () => {
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      const item = result.details.items[0];
      expect(item.label).toBeDisplayString('Total');
      expect(item.requestCount).toBe(4);
      expect(item.size).toBe(160);
    });

    it('table includes all resource types', async () => {
      const result = await ResourceBudgetAudit.audit(artifacts, context);
      expect(result.details.items).toHaveLength(9);
    });

    describe('table ordering', () => {
      it('except for the last row, it sorts items by size (descending)', async () => {
        const result = await ResourceBudgetAudit.audit(artifacts, context);
        const items = result.details.items;
        items.slice(0, -2).forEach((item, index) => {
          expect(item.size).toBeGreaterThanOrEqual(items[index + 1].size);
        });
      });

      it('"Total" is the first row', async () => {
        const result = await ResourceBudgetAudit.audit(artifacts, context);
        expect(result.details.items[0].resourceType).toBe('total');
      });

      it('"Third-party" is the last-row', async () => {
        const result = await ResourceBudgetAudit.audit(artifacts, context);
        const items = result.details.items;
        expect(items[items.length - 1].resourceType).toBe('third-party');
      });
    });
  });
});
