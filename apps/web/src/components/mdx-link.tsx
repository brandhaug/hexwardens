import { type AnchorHTMLAttributes, type ComponentType } from 'react'

import { Link } from '@tanstack/react-router'

export interface MdxComponentProps {
	components?: Record<string, ComponentType<never>>
}

type MdxLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>

export function MdxLink({ href, children, target, ...props }: MdxLinkProps) {
	if (!href) {
		return (
			<a target={target} {...props}>
				{children}
			</a>
		)
	}

	const isInternal = href.startsWith('/') || href.startsWith('#')

	if (isInternal) {
		return (
			<Link to={href} {...(target === undefined ? {} : { target })} {...props}>
				{children}
			</Link>
		)
	}

	return (
		<a
			href={href}
			target={target ?? '_blank'}
			rel='noopener noreferrer'
			{...props}
		>
			{children}
		</a>
	)
}
