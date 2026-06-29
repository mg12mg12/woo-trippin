把四張季節背景放這裡,檔名固定:
  spring.png  (春)
  summer.png  (夏)
  autumn.png  (秋)
  winter.png  (冬)

每張請用「該季圖最下面那個場景」裁切出來(寬橫幅、含上方天空)。
網頁會依目前月份自動選背景(現在 6 月 = summer.png),標題壓在天空上。
若某張還沒放,會先顯示淡藍天空底色,不會壞掉。

不想自己裁?把四張「原始三格圖」放到 ../tools/src/(命名 spring.png…winter.png),
在 tools/ 執行:  python make-bg.py   會自動裁好最下面那格輸出到這裡。
