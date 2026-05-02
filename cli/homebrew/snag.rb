# Reference Homebrew formula for the snag CLI.
#
# This file is the source-of-truth template; the LIVE formula that
# Homebrew installs lives at:
#   https://github.com/itzAditya0/homebrew-snag/blob/main/Formula/snag.rb
#
# The cli-release.yml workflow regenerates the live formula on every
# release tag and pushes it to that tap repo, so end users get
# `brew upgrade snag` for free without any manual edits here.
#
# Manually testing a formula change locally:
#   brew install --build-from-source ./cli/homebrew/snag.rb
#   brew test snag
#   brew audit --strict --new-formula snag
#
# Placeholders (__VERSION__, __SHA256_*__) are filled by the workflow
# from the release artifacts. If you ever need to bump by hand:
#   1. Pick the cli-vX.Y.Z release tag.
#   2. Set version, then sha256 = sha256 of each of the 4 .tar.gz files.
#   3. Push to the tap.

class Snag < Formula
  desc "Paste a link, get the file — terminal media downloader"
  homepage "https://github.com/itzAditya0/Snag"
  version "__VERSION__"
  license "AGPL-3.0-or-later"

  on_macos do
    on_intel do
      url "https://github.com/itzAditya0/Snag/releases/download/cli-v#{version}/snag_#{version}_darwin_amd64.tar.gz"
      sha256 "__SHA256_DARWIN_AMD64__"
    end
    on_arm do
      url "https://github.com/itzAditya0/Snag/releases/download/cli-v#{version}/snag_#{version}_darwin_arm64.tar.gz"
      sha256 "__SHA256_DARWIN_ARM64__"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/itzAditya0/Snag/releases/download/cli-v#{version}/snag_#{version}_linux_amd64.tar.gz"
      sha256 "__SHA256_LINUX_AMD64__"
    end
    on_arm do
      url "https://github.com/itzAditya0/Snag/releases/download/cli-v#{version}/snag_#{version}_linux_arm64.tar.gz"
      sha256 "__SHA256_LINUX_ARM64__"
    end
  end

  def install
    bin.install "snag"
    # generate shell completions for the user. fish/zsh/bash all
    # supported. these are best-effort: if --completion errors
    # (e.g. on a stripped-down release build), we just skip.
    generate_completions_from_executable(bin/"snag", "completion")
  end

  test do
    # `snag --version` is wired up automatically by cobra from the
    # version.Version var (see cli/internal/version/version.go and
    # the -ldflags -X in cli-release.yml).
    assert_match version.to_s, shell_output("#{bin}/snag --version")
  end
end
