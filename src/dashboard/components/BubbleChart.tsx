'use client';

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { TickerTooltip } from './TickerTooltip';
import { TickerDetail } from './TickerDetail';

const CHART_COLORS: Record<string, string> = {
  stock: '#4f8ff7',
  etf: '#34d399',
  crypto: '#f5a623',
};

interface BubbleChartProps {
  scores: any[];
  highlightTicker: string | null;
  horizon: number;
  mode?: string;
}

export function BubbleChart({ scores, highlightTicker, horizon, mode = 'percentile' }: BubbleChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; data: any } | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<any>(null);
  const [sizeTick, setSizeTick] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (Math.abs(w - last.w) > 1 || Math.abs(h - last.h) > 1) {
        last = { w, h };
        setSizeTick((t) => t + 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || scores.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 24, right: 32, bottom: 48, left: 52 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    // Defs for gradients and filters
    const defs = svg.append('defs');

    // Radial gradient for chart background atmosphere
    const bgGrad = defs.append('radialGradient')
      .attr('id', 'chart-bg')
      .attr('cx', '30%').attr('cy', '30%').attr('r', '70%');
    bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#181f2c').attr('stop-opacity', 1);
    bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#0d1017').attr('stop-opacity', 1);

    // Glow filter for highlighted bubbles
    const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const merge = glow.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Chart background
    svg.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'url(#chart-bg)');

    // Scales
    const xScale = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);

    const marketCaps = scores.map((s) => s.market_cap ?? 1).filter((v) => v > 0);
    const radiusScale = d3.scaleSqrt()
      .domain([d3.min(marketCaps) ?? 1, d3.max(marketCaps) ?? 1e12])
      .range([3, 32]);

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        updateLabels(event.transform.k);
      });
    svg.call(zoom);

    // Fine grid (every 10 units)
    for (let i = 10; i <= 90; i += 10) {
      g.append('line')
        .attr('x1', xScale(i)).attr('x2', xScale(i))
        .attr('y1', margin.top).attr('y2', height - margin.bottom)
        .attr('stroke', 'rgba(255,255,255,0.08)').attr('stroke-width', 0.5);
      g.append('line')
        .attr('x1', margin.left).attr('x2', width - margin.right)
        .attr('y1', yScale(i)).attr('y2', yScale(i))
        .attr('stroke', 'rgba(255,255,255,0.08)').attr('stroke-width', 0.5);
    }

    // Major grid at 25, 50, 75
    [25, 50, 75].forEach((v) => {
      const isCenter = v === 50;
      const opacity = isCenter ? 0.16 : 0.10;
      g.append('line')
        .attr('x1', xScale(v)).attr('x2', xScale(v))
        .attr('y1', margin.top).attr('y2', height - margin.bottom)
        .attr('stroke', `rgba(255,255,255,${opacity})`).attr('stroke-width', isCenter ? 1 : 0.5)
        .attr('stroke-dasharray', isCenter ? 'none' : '2,6');
      g.append('line')
        .attr('x1', margin.left).attr('x2', width - margin.right)
        .attr('y1', yScale(v)).attr('y2', yScale(v))
        .attr('stroke', `rgba(255,255,255,${opacity})`).attr('stroke-width', isCenter ? 1 : 0.5)
        .attr('stroke-dasharray', isCenter ? 'none' : '2,6');
    });

    // Quadrant zone labels
    const quadrants = [
      { x: 25, y: 80, label: 'OPPORTUNITY', sub: 'Low Risk, High Upward', color: '#34d399' },
      { x: 75, y: 80, label: 'SPECULATIVE', sub: 'High Risk, High Upward', color: '#f5a623' },
      { x: 25, y: 20, label: 'STABLE', sub: 'Low Risk, Low Upward', color: '#7a8494' },
      { x: 75, y: 20, label: 'AVOID', sub: 'High Risk, Low Upward', color: '#f04444' },
    ];
    quadrants.forEach(({ x, y, label, sub, color }) => {
      g.append('text')
        .attr('x', xScale(x)).attr('y', yScale(y))
        .attr('text-anchor', 'middle').attr('fill', color)
        .attr('font-size', 20).attr('opacity', 0.18)
        .attr('font-weight', 600)
        .attr('letter-spacing', '0.12em')
        .text(label);
      g.append('text')
        .attr('x', xScale(x)).attr('y', yScale(y) + 26)
        .attr('text-anchor', 'middle').attr('fill', color)
        .attr('font-size', 16).attr('opacity', 0.10)
        .text(sub);
    });

    // Axes
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(10).tickSize(-height + margin.top + margin.bottom).tickPadding(8));
    xAxis.select('.domain').attr('stroke', 'rgba(255,255,255,0.12)');
    xAxis.selectAll('.tick line').attr('stroke', 'none');
    xAxis.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.26)').attr('font-size', 9);

    const yAxis = g.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(10).tickSize(-width + margin.left + margin.right).tickPadding(8));
    yAxis.select('.domain').attr('stroke', 'rgba(255,255,255,0.12)');
    yAxis.selectAll('.tick line').attr('stroke', 'none');
    yAxis.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.26)').attr('font-size', 9);

    // Axis labels
    g.append('text')
      .attr('x', width / 2).attr('y', height - 6)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.34)')
      .attr('font-size', 14).attr('letter-spacing', '0.15em')
      .text('RISK SCORE');
    g.append('text')
      .attr('x', -height / 2).attr('y', 12)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.34)')
      .attr('font-size', 14).attr('letter-spacing', '0.15em')
      .text('UPWARD PROBABILITY');

    // Bubbles
    const bubbles = g.selectAll('.bubble')
      .data(scores)
      .enter()
      .append('g')
      .attr('class', 'bubble')
      .attr('transform', (d: any) =>
        `translate(${xScale(d.risk_score)},${yScale(d.upward_probability_score)})`
      );

    bubbles.append('circle')
      .attr('r', (d: any) => radiusScale(d.market_cap ?? 1))
      .attr('fill', (d: any) => CHART_COLORS[d.asset_class] ?? '#4f8ff7')
      .attr('fill-opacity', (d: any) => {
        if (highlightTicker && d.ticker !== highlightTicker) return 0.08;
        return 0.55;
      })
      .attr('stroke', (d: any) => {
        if (highlightTicker === d.ticker) return '#ffffff';
        return CHART_COLORS[d.asset_class] ?? '#4f8ff7';
      })
      .attr('stroke-opacity', (d: any) => {
        if (highlightTicker === d.ticker) return 1;
        return 0.25;
      })
      .attr('stroke-width', (d: any) => highlightTicker === d.ticker ? 2 : 0.5)
      .attr('filter', (d: any) => highlightTicker === d.ticker ? 'url(#glow)' : 'none')
      .style('cursor', 'pointer')
      .style('transition', 'fill-opacity 0.2s, stroke-opacity 0.2s')
      .on('mouseenter', function (event: any, d: any) {
        d3.select(this).attr('fill-opacity', 0.85).attr('stroke-opacity', 0.8).attr('stroke-width', 1.5);
        setTooltip({ x: event.pageX, y: event.pageY, data: d });
      })
      .on('mouseleave', function (_event: any, d: any) {
        const isHighlighted = highlightTicker === d.ticker;
        d3.select(this)
          .attr('fill-opacity', isHighlighted ? 0.85 : (highlightTicker ? 0.08 : 0.55))
          .attr('stroke-opacity', isHighlighted ? 1 : 0.25)
          .attr('stroke-width', isHighlighted ? 2 : 0.5);
        setTooltip(null);
      })
      .on('click', (_event: any, d: any) => setSelectedTicker(d));

    // Labels
    const labels = bubbles.append('text')
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', 'rgba(255,255,255,0.9)').attr('pointer-events', 'none')
      .attr('font-size', 9).attr('font-weight', 500)
      .text((d: any) => d.ticker);

    function updateLabels(k: number) {
      labels.each(function (this: SVGTextElement, d: any) {
        const baseR = radiusScale(d.market_cap ?? 1);
        const apparentR = baseR * k;
        const el = d3.select(this);
        if (apparentR < 10) {
          el.attr('opacity', 0);
        } else {
          const fontSize = Math.min(9, (apparentR * 0.8) / Math.max(d.ticker.length * 0.55, 1));
          el.attr('opacity', 1).attr('font-size', fontSize / k);
        }
      });
    }

    updateLabels(1);

    return () => { svg.selectAll('*').remove(); };
  }, [scores, highlightTicker, horizon, sizeTick]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" />
      {tooltip && <TickerTooltip {...tooltip} />}
      {selectedTicker && (
        <TickerDetail data={selectedTicker} horizon={horizon} mode={mode} onClose={() => setSelectedTicker(null)} />
      )}
    </div>
  );
}
