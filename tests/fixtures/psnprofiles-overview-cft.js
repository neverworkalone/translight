const root = document.querySelector('#metacritic-root');
const isDetail = location.pathname.endsWith('-detail.html');

root.innerHTML = `
  <section class="fixture-card">
    <div class="overview-info">
      <span class="tag">
        <span class="typo-top">3/10</span><br />
        <span class="typo-bottom">Difficulty</span>
      </span>
      <span class="tag">
        <span class="typo-top">1</span><br />
        <span class="typo-bottom">Playthrough</span>
      </span>
      <span class="tag">
        <span class="typo-top">20</span><br />
        <span class="typo-bottom">Hours</span>
      </span>
    </div>
    <h1>${isDetail ? 'Star Wars Zero Company' : 'Metacritic Latest News'}</h1>
    <h2>Latest News</h2>
    <p>${isDetail ? 'Detail route story' : 'Homepage story'} contains enough deterministic English content to exercise the packaged extension.</p>
    <table class="walkthrough-table">
      <tbody><tr>
        <td>Kamikaze</td>
        <td data-translight-cft-walkthrough="intro">
          For the hardest single-chapter trophy of the game, you must choose the best path to the end and do so impeccably.
          This will likely not go on your first run, so just move on and retry it with chapter select later if so.
          Here are the instructions for the perfect route: It is recommended that you pause the game every 2-4 actions so you can check your next move.
          These instructions are for the hardest difficulty, but everything except the button prompts are the same on the lowest.
          Note that the walkthrough will also mention prompts that don't present choices: if your only choice is to go left, for instance, this guide will say left, so that you don't lose track of where you are in the list.
          Thanks to <a href="#author">FrumpleOrz</a> for pointing out some flaws in the instructions (these have been corrected).
          <ul>
            <li>Go left. Tilt right. Go right. Go left. Tilt left. Tilt right.</li>
            <li>Your car is fishtailing, you must continuously tilt the controller left to right.</li>
            <li>Tilt left. Tilt right. Go left. R2. Tilt right. Tilt left. Tilt right. Tilt left. Right Analog. Go right. Go right. Tilt left. Go right.</li>
            <li>The most troublesome part: right after the tollbooth, a police car will ride up to your left. You want to steer away, but be sure not to hit the police car in your abrupt movement.</li>
          </ul>
        </td>
        <td>Kamikaze</td>
      </tr></tbody>
    </table>
  </section>
  ${isDetail
    ? '<p><a href="/tests/fixtures/psnprofiles-overview-cft.html">Return to homepage</a></p>'
    : '<section class="fixture-card"><h2>New and Notable</h2><p><a href="/tests/fixtures/psnprofiles-overview-cft-detail.html">Star Wars Zero Company</a></p></section>'}
`;
