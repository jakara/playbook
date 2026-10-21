import type { Page } from '@playwright/test';

// A self-contained simulated catalog, with no business system or network access.
export async function mountCatalog(page: Page) {
  const heading = process.env.PLAYBOOK_TEST_BROKEN_EXPECTATION ? 'Changed task' : 'Poster brief';
  await page.setContent(`<!doctype html><html lang="en"><title>Catalog fixture</title><body>
    <label>Search courses <input id="query"></label><button id="search">Search</button>
    <table aria-label="Courses"><thead><tr><th>Course</th><th>Action</th></tr></thead><tbody>
      <tr><td>Poster design</td><td><button id="preview">Preview</button></td></tr>
      <tr><td>Animation basics</td><td><button>Preview</button></td></tr>
    </tbody></table>
    <dialog aria-label="Task preview"><h2>${heading}</h2><p>Create a warm/cool poster.</p></dialog>
    <script>
      document.querySelector('#search').onclick = () => {
        const query = document.querySelector('#query').value.toLowerCase();
        for (const row of document.querySelectorAll('tbody tr'))
          row.hidden = !row.textContent.toLowerCase().includes(query);
      };
      document.querySelector('#preview').onclick = () => document.querySelector('dialog').showModal();
    </script></body></html>`);
}
