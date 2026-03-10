interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const percent = Math.round(score * 100);
  const tone = percent >= 80 ? 'good' : percent >= 65 ? 'warn' : 'bad';

  return (
    <span className={`score-badge ${tone}`}>
      {percent}% match
    </span>
  );
}
