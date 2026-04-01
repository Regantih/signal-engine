#!/usr/bin/env python3
"""
Signal Engine Autoresearch — Autonomous Ratchet Loop
=====================================================
Implements the Karpathy autoresearch pattern for signal optimization.

Usage:
  python run_experiment.py --experiments 100
  python run_experiment.py --experiments 10 --description "sweep momentum weight"

The loop:
  1. Reads engine.py
  2. Invokes an LLM (Claude) to propose and apply a modification to engine.py
  3. Runs engine.py and captures output
  4. Parses metrics from stdout
  5. If sharpe_ratio improved AND constraints met: git commit + keep
  6. Else: git revert engine.py to HEAD
  7. Logs every experiment to results.tsv
  8. Repeats N times

Constraints for "keep":
  - sharpe_ratio improved vs current best
  - max_drawdown_pct <= 15.0
  - win_rate >= 45.0
  - total_trades >= 20

For running without an LLM (manual mode), pass --manual:
  python run_experiment.py --manual
  Then edit engine.py yourself and press Enter to evaluate.
"""

import argparse
import subprocess
import sys
import os
import re
import csv
import time
from pathlib import Path
from typing import Optional, Dict, Any


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR   = Path(__file__).parent
ENGINE_PY    = SCRIPT_DIR / "engine.py"
RESULTS_TSV  = SCRIPT_DIR / "results.tsv"
RUN_LOG      = SCRIPT_DIR / "run.log"
PREPARE_PY   = SCRIPT_DIR / "prepare.py"
EXPORT_PY    = SCRIPT_DIR / "export_params.py"


# ---------------------------------------------------------------------------
# Constraints (must all pass for a "keep")
# ---------------------------------------------------------------------------

MAX_DRAWDOWN_LIMIT  = 15.0
MIN_WIN_RATE        = 45.0
MIN_TOTAL_TRADES    = 20


# ---------------------------------------------------------------------------
# Run engine.py and capture output
# ---------------------------------------------------------------------------

def run_engine(python_exe: str = sys.executable) -> tuple[str, int]:
    """Run engine.py, capture output to run.log, return (stdout_content, returncode)."""
    with open(RUN_LOG, "w") as log_f:
        result = subprocess.run(
            [python_exe, str(ENGINE_PY)],
            stdout=log_f,
            stderr=subprocess.STDOUT,
            cwd=str(SCRIPT_DIR),
        )
    with open(RUN_LOG, "r") as f:
        content = f.read()
    return content, result.returncode


def parse_metrics(output: str) -> Optional[Dict[str, Any]]:
    """
    Parse the ---\\n metric block from engine.py output.
    Returns dict or None if parsing fails.
    """
    # Find the --- block
    match = re.search(r"---\n(.*?)(?:\n\n|\Z)", output, re.DOTALL)
    if not match:
        return None

    block = match.group(1)
    metrics = {}
    for line in block.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = line.split(":", 1)
        if len(parts) != 2:
            continue
        key, val = parts[0].strip(), parts[1].strip()
        try:
            metrics[key] = float(val)
        except ValueError:
            metrics[key] = val

    # Validate required keys
    required = ["sharpe_ratio", "total_return_pct", "max_drawdown_pct",
                "win_rate", "total_trades"]
    for r in required:
        if r not in metrics:
            return None

    return metrics


def check_constraints(metrics: Dict[str, Any]) -> tuple[bool, str]:
    """Returns (passes, reason_if_fails)."""
    if metrics["max_drawdown_pct"] > MAX_DRAWDOWN_LIMIT:
        return False, f"max_drawdown {metrics['max_drawdown_pct']:.2f} > {MAX_DRAWDOWN_LIMIT}"
    if metrics["win_rate"] < MIN_WIN_RATE:
        return False, f"win_rate {metrics['win_rate']:.2f} < {MIN_WIN_RATE}"
    if metrics["total_trades"] < MIN_TOTAL_TRADES:
        return False, f"total_trades {int(metrics['total_trades'])} < {MIN_TOTAL_TRADES}"
    return True, ""


# ---------------------------------------------------------------------------
# Git operations
# ---------------------------------------------------------------------------

def git_commit(message: str) -> str:
    """Commit engine.py with message. Returns short hash."""
    subprocess.run(
        ["git", "add", str(ENGINE_PY)],
        cwd=str(SCRIPT_DIR),
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-m", message],
        cwd=str(SCRIPT_DIR),
        check=True,
        capture_output=True,
    )
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=str(SCRIPT_DIR),
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def git_revert_engine() -> None:
    """Revert engine.py to the last commit."""
    subprocess.run(
        ["git", "checkout", "HEAD", "--", str(ENGINE_PY)],
        cwd=str(SCRIPT_DIR),
        check=True,
        capture_output=True,
    )


def git_current_hash() -> str:
    """Return current short commit hash."""
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=str(SCRIPT_DIR),
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def run_export_params() -> bool:
    """Run export_params.py to regenerate JSON and TypeScript param files.
    Returns True on success."""
    if not EXPORT_PY.exists():
        return False
    result = subprocess.run(
        [sys.executable, str(EXPORT_PY)],
        cwd=str(SCRIPT_DIR),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        print(f"  → Exported params: {result.stdout.strip()}")
        return True
    else:
        print(f"  → Warning: export_params.py failed: {result.stderr.strip()}")
        return False


# ---------------------------------------------------------------------------
# TSV logging
# ---------------------------------------------------------------------------

def log_result(
    commit_hash: str,
    metrics: Dict[str, Any],
    status: str,
    description: str,
) -> None:
    """Append one row to results.tsv."""
    # Ensure header exists
    if not RESULTS_TSV.exists() or RESULTS_TSV.stat().st_size == 0:
        with open(RESULTS_TSV, "w") as f:
            f.write("commit\tsharpe_ratio\ttotal_return_pct\tmax_drawdown_pct\twin_rate\tstatus\tdescription\n")

    with open(RESULTS_TSV, "a", newline="") as f:
        writer = csv.writer(f, delimiter="\t")
        writer.writerow([
            commit_hash,
            f"{metrics.get('sharpe_ratio', 0):.3f}",
            f"{metrics.get('total_return_pct', 0):.2f}",
            f"{metrics.get('max_drawdown_pct', 0):.2f}",
            f"{metrics.get('win_rate', 0):.2f}",
            status,
            description.replace("\t", " "),
        ])


def log_crash(commit_hash: str, description: str) -> None:
    """Log a crashed experiment."""
    crash_metrics = {
        "sharpe_ratio": 0.0,
        "total_return_pct": 0.0,
        "max_drawdown_pct": 0.0,
        "win_rate": 0.0,
        "total_trades": 0.0,
    }
    log_result(commit_hash, crash_metrics, "crash", description)


# ---------------------------------------------------------------------------
# Best sharpe tracking
# ---------------------------------------------------------------------------

def load_best_sharpe() -> float:
    """Read best sharpe from results.tsv (only kept experiments)."""
    if not RESULTS_TSV.exists():
        return -999.0
    best = -999.0
    try:
        with open(RESULTS_TSV, "r") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                if row.get("status") == "keep":
                    try:
                        sr = float(row["sharpe_ratio"])
                        if sr > best:
                            best = sr
                    except (ValueError, KeyError):
                        pass
    except Exception:
        pass
    return best


# ---------------------------------------------------------------------------
# Manual mode — user edits engine.py between experiments
# ---------------------------------------------------------------------------

def run_manual_mode(n_experiments: int) -> None:
    """
    Manual ratchet loop. User edits engine.py externally, presses Enter to evaluate.
    """
    best_sharpe = load_best_sharpe()
    print(f"Manual mode: {n_experiments} experiments. Current best sharpe: {best_sharpe:.3f}")
    print(f"Edit {ENGINE_PY} between experiments, then press Enter to evaluate.\n")

    for exp_num in range(1, n_experiments + 1):
        print(f"─── Experiment {exp_num}/{n_experiments} ───")
        desc = input("Description of this experiment (or 'quit' to stop): ").strip()
        if desc.lower() == "quit":
            break

        print("Running engine.py...")
        output, returncode = run_engine()

        if returncode != 0 or "---" not in output:
            print("CRASH or no output. Check run.log.")
            print(output[-1000:] if len(output) > 1000 else output)
            h = git_current_hash()
            log_crash(h, desc)
            git_revert_engine()
            input("Engine reverted. Press Enter to continue...")
            continue

        metrics = parse_metrics(output)
        if metrics is None:
            print("Could not parse metrics. Check run.log.")
            h = git_current_hash()
            log_crash(h, desc)
            git_revert_engine()
            input("Engine reverted. Press Enter to continue...")
            continue

        print(f"\n  sharpe_ratio:     {metrics['sharpe_ratio']:.3f}  (best: {best_sharpe:.3f})")
        print(f"  total_return_pct: {metrics['total_return_pct']:.2f}")
        print(f"  max_drawdown_pct: {metrics['max_drawdown_pct']:.2f}")
        print(f"  win_rate:         {metrics['win_rate']:.2f}")
        print(f"  total_trades:     {int(metrics['total_trades'])}")

        passes, reason = check_constraints(metrics)
        improved = metrics["sharpe_ratio"] > best_sharpe

        if improved and passes:
            h = git_commit(f"experiment: {desc}")
            best_sharpe = metrics["sharpe_ratio"]
            log_result(h, metrics, "keep", desc)
            print(f"  → KEEP (new best! sharpe={best_sharpe:.3f})")
            run_export_params()
        else:
            if not passes:
                print(f"  → DISCARD (constraint violated: {reason})")
            else:
                print(f"  → DISCARD (sharpe {metrics['sharpe_ratio']:.3f} <= best {best_sharpe:.3f})")
            h = git_current_hash()
            log_result(h, metrics, "discard", desc)
            git_revert_engine()
            print("  engine.py reverted to last kept version.")

        print()

    print(f"\nDone. Best sharpe achieved: {best_sharpe:.3f}")
    print(f"Results saved to: {RESULTS_TSV}")


# ---------------------------------------------------------------------------
# LLM-guided mode (Claude via subprocess)
# ---------------------------------------------------------------------------

def run_llm_guided_mode(n_experiments: int, ai_model: str = "claude-opus-4-5") -> None:
    """
    Autonomous ratchet loop: uses an AI agent to modify engine.py.

    The agent is given the current engine.py, the program.md instructions,
    the last 10 rows of results.tsv, and the current best sharpe, then
    asked to produce a new engine.py.

    Requires: anthropic Python package and ANTHROPIC_API_KEY env var.
    """
    try:
        import anthropic
    except ImportError:
        print("anthropic package not found. Install with: pip install anthropic")
        print("Falling back to manual mode.")
        run_manual_mode(n_experiments)
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set. Falling back to manual mode.")
        run_manual_mode(n_experiments)
        return

    client = anthropic.Anthropic(api_key=api_key)
    best_sharpe = load_best_sharpe()
    print(f"LLM-guided mode: {n_experiments} experiments. Current best sharpe: {best_sharpe:.3f}\n")

    for exp_num in range(1, n_experiments + 1):
        print(f"─── Experiment {exp_num}/{n_experiments} ─── (best sharpe: {best_sharpe:.3f})")

        # Build context for the agent
        engine_content = ENGINE_PY.read_text()
        program_content = (SCRIPT_DIR / "program.md").read_text()

        # Last 10 kept/discarded results
        results_context = ""
        if RESULTS_TSV.exists():
            with open(RESULTS_TSV, "r") as f:
                lines = f.readlines()
            recent = lines[-11:] if len(lines) > 11 else lines
            results_context = "".join(recent)

        system_prompt = f"""You are an autonomous AI researcher optimizing a financial signal engine.

Your goal: maximize sharpe_ratio while keeping max_drawdown_pct <= 15, win_rate >= 45, total_trades >= 20.

You have read program.md and understand the constraints. You will now propose and implement ONE experiment by modifying engine.py.

Rules:
1. Return ONLY the complete new content of engine.py. Nothing else. No explanation, no markdown, no ```python fence.
2. Make ONE focused change per experiment.
3. Weights must sum to exactly 1.0.
4. Build on what has worked in recent results.
5. Do not modify the PARAMS dict structure — only the constant values above it.
6. Do not add imports beyond the standard library.

Recent results (TSV):
{results_context if results_context else "(no results yet — this is the baseline)"}

Current best sharpe: {best_sharpe:.3f}
"""

        user_prompt = f"""Here is the current engine.py:

{engine_content}

Here is program.md for reference (research directions):

{program_content[:3000]}

Please propose and implement ONE experiment. Return the COMPLETE new engine.py content — nothing else."""

        try:
            response = client.messages.create(
                model=ai_model,
                max_tokens=4096,
                messages=[{"role": "user", "content": user_prompt}],
                system=system_prompt,
            )
            new_engine_content = response.content[0].text.strip()

            # Strip any accidental markdown fences
            if new_engine_content.startswith("```"):
                lines = new_engine_content.split("\n")
                new_engine_content = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

        except Exception as e:
            print(f"  LLM call failed: {e}")
            h = git_current_hash()
            log_crash(h, f"llm_call_failed: {e}")
            time.sleep(5)
            continue

        # Extract description from the first comment line
        desc_match = re.search(r'# experiment[:\s]+(.+)', new_engine_content[:500], re.IGNORECASE)
        if desc_match:
            description = desc_match.group(1).strip()
        else:
            # Try to infer from changed constants
            description = f"llm_experiment_{exp_num}"

        # Write the modified engine.py
        ENGINE_PY.write_text(new_engine_content)

        # Validate: must be parseable Python
        try:
            compile(new_engine_content, str(ENGINE_PY), "exec")
        except SyntaxError as e:
            print(f"  Syntax error in generated engine.py: {e}")
            h = git_current_hash()
            log_crash(h, f"syntax_error: {description}")
            git_revert_engine()
            continue

        print(f"  Running: {description}")
        output, returncode = run_engine()

        if returncode != 0 or "---" not in output:
            print(f"  CRASH. tail of run.log:")
            lines = output.strip().split("\n")
            for l in lines[-15:]:
                print(f"    {l}")
            h = git_current_hash()
            log_crash(h, description)
            git_revert_engine()
            continue

        metrics = parse_metrics(output)
        if metrics is None:
            print("  Could not parse metrics output.")
            h = git_current_hash()
            log_crash(h, description)
            git_revert_engine()
            continue

        print(f"  sharpe={metrics['sharpe_ratio']:.3f}  dd={metrics['max_drawdown_pct']:.2f}%  wr={metrics['win_rate']:.2f}%  trades={int(metrics['total_trades'])}")

        passes, reason = check_constraints(metrics)
        improved = metrics["sharpe_ratio"] > best_sharpe

        if improved and passes:
            h = git_commit(f"autoresearch: {description}")
            best_sharpe = metrics["sharpe_ratio"]
            log_result(h, metrics, "keep", description)
            print(f"  → KEEP  (new best! sharpe={best_sharpe:.3f})")
            run_export_params()
        else:
            if not passes:
                print(f"  → DISCARD (constraint: {reason})")
            else:
                print(f"  → DISCARD (sharpe {metrics['sharpe_ratio']:.3f} <= {best_sharpe:.3f})")
            h = git_current_hash()
            log_result(h, metrics, "discard", description)
            git_revert_engine()

        print()

    print(f"\nDone. Best sharpe achieved: {best_sharpe:.3f}")
    print(f"Results: {RESULTS_TSV}")


# ---------------------------------------------------------------------------
# Baseline run
# ---------------------------------------------------------------------------

def run_baseline() -> Optional[Dict[str, Any]]:
    """Run the current engine.py as baseline and log it."""
    print("Running baseline...")
    output, returncode = run_engine()

    if returncode != 0 or "---" not in output:
        print("Baseline CRASHED. Check run.log.")
        print(output[-2000:] if len(output) > 2000 else output)
        return None

    metrics = parse_metrics(output)
    if metrics is None:
        print("Could not parse baseline metrics.")
        return None

    print(f"\nBaseline metrics:")
    print(f"  sharpe_ratio:     {metrics['sharpe_ratio']:.3f}")
    print(f"  total_return_pct: {metrics['total_return_pct']:.2f}")
    print(f"  max_drawdown_pct: {metrics['max_drawdown_pct']:.2f}")
    print(f"  win_rate:         {metrics['win_rate']:.2f}")
    print(f"  total_trades:     {int(metrics['total_trades'])}")

    h = git_current_hash()
    log_result(h, metrics, "keep", "baseline")
    return metrics


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Signal Engine Autoresearch — Ratchet Loop"
    )
    parser.add_argument(
        "--experiments", type=int, default=20,
        help="Number of experiments to run (default: 20)"
    )
    parser.add_argument(
        "--manual", action="store_true",
        help="Manual mode: user edits engine.py between experiments"
    )
    parser.add_argument(
        "--baseline-only", action="store_true",
        help="Run baseline only and exit"
    )
    parser.add_argument(
        "--model", type=str, default="claude-opus-4-5",
        help="Claude model to use for LLM-guided mode (default: claude-opus-4-5)"
    )
    parser.add_argument(
        "--no-baseline", action="store_true",
        help="Skip baseline run and go straight to experiments"
    )
    args = parser.parse_args()

    print("Signal Engine Autoresearch")
    print(f"Engine: {ENGINE_PY}")
    print(f"Results: {RESULTS_TSV}")
    print()

    # Ensure results.tsv has header
    if not RESULTS_TSV.exists() or RESULTS_TSV.stat().st_size == 0:
        with open(RESULTS_TSV, "w") as f:
            f.write("commit\tsharpe_ratio\ttotal_return_pct\tmax_drawdown_pct\twin_rate\tstatus\tdescription\n")

    # Run baseline if not already done
    best_sharpe = load_best_sharpe()
    if not args.no_baseline and best_sharpe <= -999:
        metrics = run_baseline()
        if metrics is None:
            print("Baseline failed. Fix engine.py before running experiments.")
            sys.exit(1)
        best_sharpe = metrics["sharpe_ratio"]
        print()

    if args.baseline_only:
        return

    # Run experiments
    if args.manual:
        run_manual_mode(args.experiments)
    else:
        run_llm_guided_mode(args.experiments, ai_model=args.model)


if __name__ == "__main__":
    main()
