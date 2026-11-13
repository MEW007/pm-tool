"""Build PSA-MoM: combine src/ into one self-contained HTML file and run the tests.

Usage (Windows, portable Python):  <python.exe> build.py
Outputs:
  release/PSA-MoM-v<version>.html   the editor (copy this into the SharePoint library)
  release/PSA-MoM-viewer.html       phase 2: read-only SharePoint viewer
  build/combined.js                 core + app, used by smoke.js
Stops with exit code 1 when test.js or smoke.js fails (the HTML is still written so you can inspect it).
Only the Python standard library is used; Node is needed for the tests.
"""
import datetime, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
read = lambda p: open(os.path.join(HERE, p), encoding="utf-8").read()


def write(p, text):
    full = os.path.join(HERE, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def stamp(js, version, build):
    return js.replace("/*@VERSION*/'dev'", repr(version)).replace("/*@BUILD*/'dev'", repr(build))


def find_node():
    """node on PATH, or the portable Node next to the portable Python (C:\\...\\.tools\\node-v*)."""
    exe = shutil.which("node")
    if exe:
        return exe
    tools = os.path.dirname(os.path.dirname(sys.executable))
    for d in sorted(os.listdir(tools)) if os.path.isdir(tools) else []:
        cand = os.path.join(tools, d, "node.exe")
        if d.startswith("node") and os.path.isfile(cand):
            return cand
    return None


def main():
    meta = json.loads(read("project.json"))
    version, build = meta["version"], datetime.date.today().isoformat()
    core = stamp(read("src/core.js"), version, build)
    app = read("src/app.js")
    css = read("src/style.css")

    html = (read("src/template.html").replace("/*@VERSION*/", version)
            .replace("/*@CSS*/", css).replace("/*@CORE*/", core).replace("/*@APP*/", app))
    if "</script" in (core + app).lower().replace("</script></body>", ""):
        sys.exit("build: '</script' found inside the JavaScript sources")
    out = f"release/PSA-MoM-v{version}.html"
    for old in os.listdir(os.path.join(HERE, "release")) if os.path.isdir(os.path.join(HERE, "release")) else []:
        if old.startswith("PSA-MoM-v") and old.endswith(".html") and old != os.path.basename(out):
            os.remove(os.path.join(HERE, "release", old))
    write(out, html)
    write("build/combined.js", core + "\n" + app)

    if os.path.isfile(os.path.join(HERE, "viewer/viewer.js")):
        vhtml = (read("viewer/template.html").replace("/*@VERSION*/", version)
                 .replace("/*@CORE*/", core).replace("/*@VIEWER*/", read("viewer/viewer.js")))
        write("release/PSA-MoM-viewer.html", vhtml)

    print(f"build: {out} ({len(html)//1024} KB), build {build}")
    node = find_node()
    if not node:
        sys.exit("build: Node not found; run test.js and smoke.js manually")
    ok = True
    for t in ("test.js", "smoke.js"):
        r = subprocess.run([node, t], cwd=HERE)
        ok = ok and r.returncode == 0
    if not ok:
        sys.exit("build: TESTS FAILED")
    print("build: alle tests geslaagd")


if __name__ == "__main__":
    main()
