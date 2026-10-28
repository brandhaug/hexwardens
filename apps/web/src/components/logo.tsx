import { cn } from '@/lib/utils'

interface LogoProps {
	className?: string
	title?: string
}

export function Logo({ className, title = 'Hexwardens' }: LogoProps) {
	return (
		<svg
			xmlns='http://www.w3.org/2000/svg'
			viewBox='0 0 512 512'
			role='img'
			aria-label={title}
			className={cn('select-none text-primary', className)}
		>
			<title>{title}</title>
			<g
				transform='translate(256 256)'
				fill='none'
				stroke='currentColor'
				strokeWidth='10'
				strokeLinejoin='round'
			>
				<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				<g transform='translate(81 -46.77)'>
					<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				</g>
				<g transform='translate(81 46.77)'>
					<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				</g>
				<g transform='translate(0 93.54)'>
					<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				</g>
				<g transform='translate(-81 46.77)'>
					<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				</g>
				<g transform='translate(-81 -46.77)'>
					<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				</g>
				<g transform='translate(0 -93.54)'>
					<polygon points='54,0 27,46.77 -27,46.77 -54,0 -27,-46.77 27,-46.77' />
				</g>
			</g>
			<g transform='translate(256 256)' fill='currentColor'>
				<circle r='28' />
			</g>
		</svg>
	)
}
