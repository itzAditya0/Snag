# publishing snag via homebrew

snag's CLI ships through a custom homebrew tap so end users can:

```bash
brew install itzAditya0/snag/snag
brew upgrade snag   # picks up new releases automatically
```

This doc covers the **one-time setup** to make that work, and the
**per-release flow** (which is automated, so you don't have to do
anything after setup).

## why a custom tap, not homebrew-core

homebrew-core has a popularity gate (≈75 stars, an ecosystem of
dependents, a maintainer who promises long-term upkeep) and a slow
review cycle. for a fresh project, a custom tap is:

- **instant** — no review, no waiting
- **owned by you** — you control the formula, no third-party reviewers
- **functionally identical** to the user — `brew install` works the
  same way, `brew upgrade` picks up new versions the same way

if snag gets popular, you can graduate to homebrew-core later. nothing
forces this decision.

## one-time setup

### 1. create the tap repo

create a new **public** repo named exactly `homebrew-snag` under your
github account (or org):

  https://github.com/itzAditya0/homebrew-snag

the `homebrew-` prefix is required. homebrew uses it to find the tap
when a user runs `brew tap itzAditya0/snag`.

initialise it with a README and an empty `Formula/` directory:

```bash
git clone https://github.com/itzAditya0/homebrew-snag
cd homebrew-snag
mkdir -p Formula
echo '# homebrew-snag — snag CLI formula' > README.md
git add . && git commit -m 'initial commit'
git push
```

### 2. generate a fine-grained PAT

the release workflow in this repo (snag) needs to push commits to the
`homebrew-snag` repo. github's default `GITHUB_TOKEN` is scoped to the
current repo, so we need a personal access token with cross-repo write.

1. visit https://github.com/settings/personal-access-tokens/new
2. **token name**: `snag-homebrew-tap`
3. **expiration**: pick whatever you're comfortable with (1 year is
   fine — you can rotate later)
4. **resource owner**: itzAditya0 (or your org)
5. **repository access** → "Only select repositories" → pick
   `homebrew-snag`
6. **permissions**:
   - repository → **contents**: read and write
   - everything else: leave at "no access"
7. generate, copy the token

### 3. add the secret + variable to the snag repo

in https://github.com/itzAditya0/Snag/settings/secrets/actions :

- **secrets** → "New repository secret":
  - name: `HOMEBREW_TAP_TOKEN`
  - value: paste the PAT from step 2

- **variables** → "New repository variable":
  - name: `HOMEBREW_TAP_REPO`
  - value: `itzAditya0/homebrew-snag`

the variable lets you change the tap name without editing the
workflow. if you ever rename the tap or move it to an org, just bump
this value.

### 4. cut a first release

```bash
cd ~/Codez/Downloader/snag
git tag cli-v0.1.0
git push origin cli-v0.1.0
```

the `cli-release.yml` workflow now:

1. cross-compiles binaries for darwin/linux × amd64/arm64
2. packages each as `snag_0.1.0_<os>_<arch>.tar.gz` with sha256 sums
3. publishes a github release at `cli-v0.1.0`
4. **fires the homebrew-update job** which:
   - downloads the release artifacts
   - computes the sha256 of each tarball
   - renders `cli/homebrew/snag.rb` (the template) with the version +
     hashes filled in
   - pushes the rendered formula to `homebrew-snag/Formula/snag.rb`

end users can now:

```bash
brew install itzAditya0/snag/snag
```

(this implicitly does `brew tap itzAditya0/snag` first, then installs
the snag formula from it. `brew upgrade snag` works as usual.)

## per-release flow (automated)

after the one-time setup, every `cli-v*` tag triggers the whole chain.
nothing else needed.

if you want to test a formula change without cutting a release, run
the `cli release` workflow manually from the actions tab — give it a
tag like `cli-v0.1.0-rc1` and it'll publish that as a release and
update the formula. just remember to delete the test release + tag
after if you don't want to keep it.

## manually testing a formula

if you need to debug the formula locally before pushing a real
release:

```bash
# from the snag repo root
brew install --build-from-source ./cli/homebrew/snag.rb
# (will fail because the template has __VERSION__ placeholders, but
# tells you if the syntax is valid)

# or, after the workflow has rendered a real formula in the tap repo:
brew tap itzAditya0/snag
brew install snag
brew test snag
brew audit --strict --new-formula snag
```

`brew audit` is what would-be homebrew-core reviewers run. if/when
you graduate to homebrew-core, audit-clean is the bar.

## moving to homebrew-core (optional, much later)

once snag has ≥75 github stars and a few months of activity, you can
submit to homebrew-core:

```bash
brew bump-formula-pr --version=X.Y.Z homebrew/core/snag
# (you'll need to fork homebrew/homebrew-core first and configure
# brew with your GitHub token; see brew docs)
```

at that point, drop the custom tap (or keep both — homebrew-core
takes precedence). homebrew-core formulas typically build from source
and require `brew test` to pass on each platform, so you might need
to add a `head` block and adjust the formula. address that bridge
when you reach it.
