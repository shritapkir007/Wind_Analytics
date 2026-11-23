"use client";

import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, DataZoomComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, DataZoomComponent, SVGRenderer]);

/** Resolve CSS custom properties (so charts follow light/dark tokens). */
function useTokens(names: string[]) {
  const key = names.join(",");
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const n of key.split(",")) {
        const m = n.match(/^var\((--[\w-]+)\)$/);
        out[n] = m ? cs.getPropertyValue(m[1]).trim() : n;
      }
      setVals(out);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", read);
      mo.disconnect();
    };
  }, [key]);
  return vals;
}

const CHROME = ["var(--ink)", "var(--ink-2)", "var(--muted)", "var(--grid)", "var(--axis)", "var(--surface)", "var(--border-strong)"];

export interface Series {
  name: string;
  color: string; // css var
  data: (number | null)[];
  stack?: string;
  type?: "bar" | "line";
}

const fmt = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000)}K` : Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

function Chart({ option, height, label, series }: { option: (t: Record<string, string>) => echarts.EChartsCoreOption; height: number; label: string; series: Series[] }) {
  const t = useTokens([...CHROME, ...series.map((s) => s.color)]);
  const ready = Object.keys(t).length > 0;
  const opt = useMemo(() => (ready ? option(t) : null), [ready, option, t]);
  return (
    <div role="img" aria-label={label} style={{ height }}>
      {opt && <ReactECharts echarts={echarts} option={opt} style={{ height }} notMerge lazyUpdate opts={{ renderer: "svg" }} />}
    </div>
  );
}

function baseGrid(t: Record<string, string>, legend: boolean) {
  return {
    textStyle: { fontFamily: "inherit", color: t["var(--ink-2)"] },
    grid: { left: 8, right: 16, top: legend ? 36 : 12, bottom: 8, containLabel: true },
    legend: legend
      ? { top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: t["var(--ink-2)"], fontSize: 12 } }
      : { show: false },
    tooltip: {
      trigger: "axis",
      backgroundColor: t["var(--surface)"],
      borderColor: t["var(--border-strong)"],
      textStyle: { color: t["var(--ink)"], fontSize: 12 },
      axisPointer: { type: "line", lineStyle: { color: t["var(--axis)"] } },
      valueFormatter: (v: number) => (v == null ? "—" : fmt(v)),
    },
  };
}

function axes(t: Record<string, string>, categories: string[], yName?: string, yMax?: number) {
  return {
    xAxis: {
      type: "category",
      data: categories,
      axisLine: { lineStyle: { color: t["var(--axis)"] } },
      axisTick: { show: false },
      axisLabel: { color: t["var(--muted)"], fontSize: 11, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      name: yName,
      max: yMax,
      nameTextStyle: { color: t["var(--muted)"], fontSize: 11, align: "left" },
      splitLine: { lineStyle: { color: t["var(--grid)"], width: 1 } },
      axisLabel: { color: t["var(--muted)"], fontSize: 11, formatter: fmt },
    },
  };
}

/** Columns over time (stacked when several series share a stack). One y-axis only. */
export function ColumnChart({ categories, series, height = 280, label, yName, refLine }: { categories: string[]; series: Series[]; height?: number; label: string; yName?: string; refLine?: { value: number; name: string } }) {
  const option = useMemo(
    () => (t: Record<string, string>) => {
      const stacked = series.filter((s) => s.stack).length > 1;
      return {
        ...baseGrid(t, series.length > 1),
        ...axes(t, categories, yName),
        series: series.map((s, i) => ({
          name: s.name,
          type: s.type ?? "bar",
          stack: s.stack,
          data: s.data,
          barMaxWidth: 24,
          itemStyle: {
            color: t[s.color],
            borderRadius: stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0],
            borderColor: t["var(--surface)"],
            borderWidth: stacked ? 1 : 0,
          },
          lineStyle: { width: 2, color: t[s.color] },
          symbolSize: 8,
          emphasis: { focus: "series" },
          markLine:
            refLine && i === 0
              ? { symbol: "none", silent: true, lineStyle: { color: t["var(--ink-2)"], type: "solid", width: 1 }, label: { formatter: refLine.name, color: t["var(--ink-2)"], fontSize: 11, position: "insideEndTop" }, data: [{ yAxis: refLine.value }] }
              : undefined,
        })),
      };
    },
    [categories, series, yName, refLine],
  );
  return <Chart option={option} height={height} label={label} series={series} />;
}

export function LineTrend({ categories, series, height = 260, label, yName, yMax, refLine, area = false }: { categories: string[]; series: Series[]; height?: number; label: string; yName?: string; yMax?: number; refLine?: { value: number; name: string }; area?: boolean }) {
  const option = useMemo(
    () => (t: Record<string, string>) => ({
      ...baseGrid(t, series.length > 1),
      ...axes(t, categories, yName, yMax),
      series: series.map((s, i) => ({
        name: s.name,
        type: "line",
        data: s.data,
        connectNulls: false,
        showSymbol: categories.length <= 16,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 2, color: t[s.color], cap: "round", join: "round" },
        itemStyle: { color: t[s.color], borderColor: t["var(--surface)"], borderWidth: 2 },
        areaStyle: area ? { color: t[s.color], opacity: 0.1 } : undefined,
        emphasis: { focus: "series" },
        markLine:
          refLine && i === 0
            ? { symbol: "none", silent: true, lineStyle: { color: t["var(--ink-2)"], type: "solid", width: 1 }, label: { formatter: refLine.name, color: t["var(--ink-2)"], fontSize: 11, position: "insideEndTop" }, data: [{ yAxis: refLine.value }] }
            : undefined,
      })),
    }),
    [categories, series, yName, yMax, refLine, area],
  );
  return <Chart option={option} height={height} label={label} series={series} />;
}

/** Horizontal bars for ranked comparisons (one series). */
export function BarRank({ labels, values, color = "var(--s1)", height, label, valueSuffix = "", refLine }: { labels: string[]; values: number[]; color?: string; height?: number; label: string; valueSuffix?: string; refLine?: { value: number; name: string } }) {
  const h = height ?? Math.max(120, labels.length * 28 + 40);
  const series = useMemo(() => [{ name: label, color, data: values }], [label, color, values]);
  const option = useMemo(
    () => (t: Record<string, string>) => ({
      ...baseGrid(t, false),
      tooltip: { ...baseGrid(t, false).tooltip, trigger: "item", valueFormatter: (v: number) => `${fmt(v)}${valueSuffix}` },
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      yAxis: { type: "category", inverse: true, data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t["var(--ink-2)"], fontSize: 12, width: 150, overflow: "truncate" } },
      xAxis: { type: "value", splitLine: { lineStyle: { color: t["var(--grid)"] } }, axisLabel: { color: t["var(--muted)"], fontSize: 11, formatter: fmt } },
      series: [
        {
          type: "bar",
          name: label,
          data: values,
          barMaxWidth: 16,
          itemStyle: { color: t[color], borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: t["var(--ink-2)"], fontSize: 11, formatter: (p: { value: number }) => `${fmt(p.value)}${valueSuffix}` },
          markLine: refLine ? { symbol: "none", silent: true, lineStyle: { color: t["var(--ink-2)"], type: "solid", width: 1 }, label: { formatter: refLine.name, color: t["var(--ink-2)"], fontSize: 11 }, data: [{ xAxis: refLine.value }] } : undefined,
        },
      ],
    }),
    [labels, values, color, valueSuffix, refLine, label],
  );
  return <Chart option={option} height={h} label={label} series={series} />;
}
