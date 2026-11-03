import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run } from "herdr";

export default class BlobTabs extends View {
  render() {
    const space = spaces().find(s => s.active);
    return h_flex().size_full().min_w(0).px(12).gap(8).items_center().bg("#282828").text_size(12)
      .child(h_flex().id("session-tabs").flex_1().min_w(0).h_full().gap(6).items_center().overflow_x_scrollbar()
        .children((space?.tabs || []).map(tab => div().id(`session-tab-${tab.id}`)
          .flex_none().px(12).py(7).rounded(7).border(1)
          .border_color(tab.active ? "#b8bb26" : "#504945")
          .bg(tab.active ? "#3c3836" : "#282828").text_color(tab.active ? "#ebdbb2" : "#a89984")
          .cursor_pointer().hover(s => s.bg("#3c3836"))
          .on_click(() => run("tab.select", { id: tab.id }))
          .child(div().max_w(180).truncate().child(tab.name)))))
      .child(div().id("new-terminal-tab").flex_none().px(12).py(7).rounded(7)
        .border(1).border_color("#504945").text_color("#ebdbb2")
        .cursor_pointer().hover(s => s.bg("#3c3836"))
        .on_click(() => run("tab.new", { space: space?.id }))
        .child("+ Terminal"));
  }
}
