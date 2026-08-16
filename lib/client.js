/**
 * dsh-plugin-focus — browser face: a read-only focus-board panel docked above
 * the composer, rendered from the `focusBoard` session projection.
 *
 * EXPERIMENTAL: this hand-written module mirrors the loader format emitted by
 * the in-repo client bundles (window.__ModuleLoader__.load with a CommonJS
 * factory). It is served to the browser on demand via the client-modules
 * roster (/plugins/<id>/client.js) when this package's composition row is
 * mounted on a web profile. React is required through the app's module
 * table; no JSX, no bundler, no TS.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-focus/client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var react = require("react");

    var cssId = "dsh-plugin-focus/client";
    var css = [
      ".dshfp-dock{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));margin:0 auto;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;padding:8px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}",
      ".dshfp-head{font-weight:500;margin-bottom:4px;color:var(--dsw-alias-label-secondary)}",
      ".dshfp-body{white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;margin:0;font:inherit;color:var(--dsw-alias-label-primary)}",
      ".dshfp-empty{color:var(--dsw-alias-label-caption)}",
    ].join("");
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"" + cssId + "\"]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-focus";
      tag.dataset.pluginCss = cssId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    /** Read-only dock entry: the session's current focus board text. */
    function FocusPanel(props) {
      var useProjection = props.useProjection;
      var projection = useProjection("focusBoard");
      if (projection == null || projection.board.length === 0) {
        return react.createElement(
          "div",
          { className: "dshfp-dock", "data-focus-panel": true },
          react.createElement("div", { className: "dshfp-empty" }, "Focus board is empty — ask the agent to pin it with the focus tool.")
        );
      }
      return react.createElement(
        "div",
        { className: "dshfp-dock", "data-focus-panel": true },
        react.createElement("div", { className: "dshfp-head" }, "Focus board (" + projection.entries + " entr" + (projection.entries === 1 ? "y" : "ies") + ")"),
        react.createElement("pre", { className: "dshfp-body" }, projection.board)
      );
    }

    /** Browser plugin body: register the dock entry into the composer dock. */
    function apply(ctx) {
      ctx.slots.inject("conversation.input.dock", function () {
        return ctx.slots.register({
          name: "conversation.input.dock",
          id: "focus-board",
          order: 20,
        }, FocusPanel);
      });
    }

    exports.name = "focus-ui";
    exports.apply = apply;
    exports.inject = ["@deepseek-ai/dsh-client-runtime"];
    return module.exports;
  },
});
