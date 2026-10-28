import { Toaster as Sonner, type ToasterProps } from 'sonner'
import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon
} from 'lucide-react'

const toastStyle: React.CSSProperties & Record<`--${string}`, string | number> =
	{
		'--normal-bg': 'var(--popover)',
		'--normal-text': 'var(--popover-foreground)',
		'--normal-border': 'var(--border)',
		'--border-radius': 'var(--radius)'
	}

function Toaster({ ...props }: ToasterProps) {
	return (
		<Sonner
			theme={'dark'}
			className='toaster group'
			icons={{
				success: <CircleCheckIcon className='size-4' aria-hidden='true' />,
				info: <InfoIcon className='size-4' aria-hidden='true' />,
				warning: <TriangleAlertIcon className='size-4' aria-hidden='true' />,
				error: <OctagonXIcon className='size-4' aria-hidden='true' />,
				loading: (
					<Loader2Icon
						className='size-4 motion-safe:animate-spin'
						aria-hidden='true'
					/>
				)
			}}
			style={toastStyle}
			toastOptions={{
				classNames: {
					toast: 'cn-toast'
				}
			}}
			{...props}
		/>
	)
}

export { Toaster }
