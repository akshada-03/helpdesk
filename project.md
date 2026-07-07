# AI-Powered Ticket Management System

## Problem

We receive hundreds of support emails daily. Our agents manually read, classify, and respond to each ticket - which is slow and leads to impersonal, canned responses.

## Solution

Build a ticket management system that uses AI to automatically classify, respond to, and route support tickets - delivering faster, more personalized responses to students while freeing up agents for complex issues.

## Features

	- Receive support emails and create tickets
	- Auto-generate human-friendly responses using a knowledge base
	- Ticket list with filtering and sorting
	- Ticket detail view
	- AI-powered ticket classification
	- AI summaries
	- AI-suggested replies
	- User management (admin only)
	- Dashboard to view and manage all tickets

## Tickets

### Statuses

A ticket has a single status at any time:

	- Open
	- Resolved
	- Closed

### Categories

A ticket belongs to a single category:

	- General question
	- Technical question
	- Refund request

## Users & Roles

The system is deployed with a single admin. The admin can then create
additional agents.

	- **Admin** - the initial user the system is deployed with; can create and manage agents
	- **Agent** - created by the admin; handles tickets